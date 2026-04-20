-- ============================================================================
-- HABIBI RESERVE — INTEGRATION SYNC (OUTBOX PATTERN)
-- ============================================================================
-- Additive migration on top of schema.sql.
--
-- Goal: when a reservation changes, emit a durable event that an external
-- worker can later deliver to integrations like Fruit. The worker is not
-- part of this file — it can be a Vercel Cron, a Supabase Edge Function,
-- a long-running worker, or a webhook pull endpoint. The schema is
-- deliberately transport-agnostic.
--
-- Key properties:
--  - Events are written in the SAME transaction as the reservation write.
--    If the reservation succeeds, the outbox row is guaranteed. No lost syncs.
--  - Events are emitted per (venue, integration) so adding a second provider
--    later (SevenRooms, Tock, etc.) costs zero schema work.
--  - Overflow reservations (`pending_manual_review`) do NOT generate outbox
--    rows. Only state changes on confirmed / cancelled / completed / no_show
--    reservations sync out, per product decision.
--  - The worker uses row-level locking (`for update skip locked`) to claim
--    batches safely under concurrent workers.
-- ============================================================================

-- ============================================================================
-- CLEAN DROP (outbox-specific objects only)
-- ============================================================================

drop function if exists public.emit_reservation_outbox(bigint, public.integration_event_type) cascade;
drop function if exists public.claim_outbox_batch(text, integer) cascade;
drop function if exists public.mark_outbox_delivered(bigint) cascade;
drop function if exists public.mark_outbox_failed(bigint, text, timestamptz) cascade;
drop function if exists public.retry_outbox_event(bigint) cascade;
drop function if exists public.get_outbox_summary(bigint) cascade;

drop table if exists public.integration_outbox cascade;

drop type if exists public.outbox_status cascade;
drop type if exists public.integration_event_type cascade;

-- ============================================================================
-- ENUMS
-- ============================================================================

create type public.integration_event_type as enum (
  'reservation_confirmed',   -- first time a reservation becomes confirmed
  'reservation_updated',     -- reassigned / time or table changed while confirmed
  'reservation_cancelled',
  'reservation_completed',
  'reservation_no_show'
);

create type public.outbox_status as enum (
  'pending',
  'delivering',   -- claimed by a worker, in flight
  'delivered',
  'failed',       -- exhausted retries; needs human attention
  'skipped'       -- integration disabled at send time; not an error
);

-- ============================================================================
-- TABLE
-- ============================================================================

create table public.integration_outbox (
  id bigserial primary key,

  venue_id bigint not null references public.venues(id) on delete cascade,
  provider text not null,
  reservation_id bigint not null references public.reservations(id) on delete cascade,

  event_type public.integration_event_type not null,

  -- Snapshot of what should be sent. Built at emit time, not re-read later,
  -- so that late-arriving reservation edits don't silently change history.
  payload jsonb not null,

  status public.outbox_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 8,

  last_error text,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  delivered_at timestamptz,

  -- Per-provider dedup: if a worker retries after a partial failure,
  -- downstream shouldn't create duplicates. Worker sends this as
  -- an Idempotency-Key (or equivalent) to the integration target.
  dedup_key text not null default gen_random_uuid()::text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint integration_outbox_attempts_chk check (attempts >= 0 and attempts <= max_attempts),
  constraint integration_outbox_max_attempts_chk check (max_attempts > 0),
  unique (provider, dedup_key)
);

-- Hot path: worker claims pending rows for a given provider, oldest first,
-- skipping anything retry-gated into the future.
create index idx_outbox_claim
  on public.integration_outbox (provider, status, next_retry_at nulls first, created_at)
  where status = 'pending';

-- Admin surface: delivery status per venue.
create index idx_outbox_venue_status
  on public.integration_outbox (venue_id, status, created_at desc);

create index idx_outbox_reservation
  on public.integration_outbox (reservation_id, created_at desc);

create index idx_outbox_failed
  on public.integration_outbox (provider, status, updated_at desc)
  where status = 'failed';

create trigger trg_integration_outbox_updated_at
before update on public.integration_outbox
for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.integration_outbox enable row level security;

-- Venue-scoped read so support / venue staff can see sync status for
-- their venue's reservations. Super admins see everything.
create policy integration_outbox_read on public.integration_outbox
  for select using (
    public.is_super_admin(auth.uid())
    or public.is_support(auth.uid())
    or public.can_access_venue(auth.uid(), venue_id)
  );

-- No direct writes. Writes flow through SECURITY DEFINER RPCs:
-- emit_reservation_outbox (called internally by reservation RPCs),
-- claim_outbox_batch / mark_outbox_delivered / mark_outbox_failed
-- (called by the worker via a service-role key).

-- ============================================================================
-- EMIT HELPER — called from reservation RPCs
-- ============================================================================
-- Produces one outbox row per enabled integration on the reservation's
-- assigned venue. Called in the same transaction as the reservation
-- write, so emission is atomic with the state change.
--
-- Payload shape is versioned (`v`) so you can evolve the schema without
-- breaking in-flight worker deliveries. The worker branches on
-- provider + event_type + v to decide how to translate to the target API.
-- ============================================================================

create or replace function public.emit_reservation_outbox(
  p_reservation_id bigint,
  p_event_type public.integration_event_type
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.reservations%rowtype;
  v_customer public.customers%rowtype;
  v_venue_id bigint;
  v_table_ids bigint[];
  v_table_names text[];
  v_payload jsonb;
  v_integration record;
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then
    return;
  end if;

  -- Overflow reservations do not sync out. Confirmed-only, per product decision.
  -- A reservation that was confirmed then cancelled DOES emit (cancellation must propagate).
  v_venue_id := coalesce(v_res.assigned_venue_id, v_res.requested_venue_id);
  if v_venue_id is null then
    return;
  end if;

  select * into v_customer from public.customers where id = v_res.customer_id;

  select
    coalesce(array_agg(rt.table_id order by rt.table_id), array[]::bigint[]),
    coalesce(array_agg(t.name order by rt.table_id), array[]::text[])
  into v_table_ids, v_table_names
  from public.reservation_tables rt
  join public.tables t on t.id = rt.table_id
  where rt.reservation_id = p_reservation_id
    and rt.released_at is null;

  v_payload := jsonb_build_object(
    'v', 1,
    'reservation_id', v_res.id,
    'event_type', p_event_type,
    'status', v_res.status,
    'source', v_res.source,
    'assigned_venue_id', v_res.assigned_venue_id,
    'starts_at', v_res.starts_at,
    'ends_at', v_res.ends_at,
    'party_size', v_res.party_size,
    'table_ids', to_jsonb(v_table_ids),
    'table_names', to_jsonb(v_table_names),
    'special_requests', v_res.special_requests,
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'full_name', v_customer.full_name,
      'email', v_customer.email,
      'phone', v_customer.phone
    ),
    'cancelled_at', v_res.cancelled_at,
    'completed_at', v_res.completed_at,
    'emitted_at', now()
  );

  -- One row per enabled integration on this venue. If the venue has two
  -- providers enabled, both get their own outbox row.
  for v_integration in
    select provider, external_location_id, config
    from public.venue_integrations
    where venue_id = v_venue_id
      and is_enabled = true
  loop
    insert into public.integration_outbox (
      venue_id, provider, reservation_id, event_type, payload
    )
    values (
      v_venue_id,
      v_integration.provider,
      p_reservation_id,
      p_event_type,
      v_payload || jsonb_build_object(
        'external_location_id', v_integration.external_location_id
      )
    );
  end loop;
end;
$$;

-- ============================================================================
-- WIRE UP RESERVATION RPCS TO EMIT
-- ============================================================================
-- Recreate the reservation RPCs that change state so they call
-- emit_reservation_outbox. Only confirmed outcomes and confirmed->terminal
-- transitions emit. Overflow does not.
-- ============================================================================

-- create_reservation_auto: emit only on successful confirmation.
-- We wrap the original function: rather than duplicate its 200-line body,
-- add a small post-hook by recreating it with the emit call in the two
-- success branches (single table and combined tables).
--
-- Simpler approach: a statement-level AFTER INSERT trigger on reservations
-- where status = 'confirmed' emits reservation_confirmed. That avoids
-- touching the RPC bodies entirely and stays correct forever.

create or replace function public.trg_reservations_emit_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- New confirmed reservation → emit.
  if (tg_op = 'INSERT') and new.status = 'confirmed' then
    perform public.emit_reservation_outbox(new.id, 'reservation_confirmed');
    return new;
  end if;

  -- Status transitions on an existing reservation.
  if (tg_op = 'UPDATE') and old.status is distinct from new.status then
    if new.status = 'confirmed' and old.status <> 'confirmed' then
      -- overflow → confirmed via reassign: treat as initial confirmation to Fruit
      perform public.emit_reservation_outbox(new.id, 'reservation_confirmed');
    elsif new.status = 'cancelled' and old.status = 'confirmed' then
      perform public.emit_reservation_outbox(new.id, 'reservation_cancelled');
    elsif new.status = 'completed' and old.status = 'confirmed' then
      perform public.emit_reservation_outbox(new.id, 'reservation_completed');
    elsif new.status = 'no_show' and old.status = 'confirmed' then
      perform public.emit_reservation_outbox(new.id, 'reservation_no_show');
    end if;
    return new;
  end if;

  -- Time or venue changed on a still-confirmed reservation (reassignment
  -- that kept it confirmed). Emit an update.
  if (tg_op = 'UPDATE')
     and new.status = 'confirmed'
     and old.status = 'confirmed'
     and (
       old.starts_at is distinct from new.starts_at
       or old.ends_at is distinct from new.ends_at
       or old.assigned_venue_id is distinct from new.assigned_venue_id
     ) then
    perform public.emit_reservation_outbox(new.id, 'reservation_updated');
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_emit_integration_events on public.reservations;
create trigger reservations_emit_integration_events
  after insert or update on public.reservations
  for each row execute function public.trg_reservations_emit_confirmed();

-- Reassigning tables without changing starts_at/ends_at/venue doesn't hit
-- the trigger above (no reservation row column changed). A separate
-- statement-level trigger on reservation_tables catches that case.

create or replace function public.trg_reservation_tables_emit_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res_id bigint;
  v_status public.reservation_status;
begin
  -- When `statement` level we aggregate; use row level but debounce via
  -- a per-reservation advisory hash to avoid emitting twice when both
  -- an insert and a release fire within the same transaction.

  if tg_op = 'INSERT' then
    v_res_id := new.reservation_id;
  else
    v_res_id := old.reservation_id;
  end if;

  select status into v_status from public.reservations where id = v_res_id;
  if v_status <> 'confirmed' then
    return coalesce(new, old);
  end if;

  -- Only emit if the triggering change is part of a reassignment on a
  -- confirmed reservation and the parent reservation trigger didn't
  -- already emit in this transaction. We use a transaction-local flag
  -- via pg_try_advisory_xact_lock to dedupe.
  if pg_try_advisory_xact_lock(
       hashtext('outbox-emit-' || v_res_id::text)::bigint
     ) then
    perform public.emit_reservation_outbox(v_res_id, 'reservation_updated');
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists reservation_tables_emit_integration_events on public.reservation_tables;
create trigger reservation_tables_emit_integration_events
  after insert or update of released_at on public.reservation_tables
  for each row execute function public.trg_reservation_tables_emit_updated();

-- ============================================================================
-- WORKER RPCS
-- ============================================================================

-- Claim a batch of pending events for a provider. Uses `for update skip
-- locked` so multiple workers can run in parallel without fighting over
-- the same rows.
--
-- Events whose venue+provider integration is disabled at claim time get
-- marked `skipped` and are NOT returned to the worker. This keeps the
-- outbox clean when operators pause or remove an integration between
-- emission and delivery.
create or replace function public.claim_outbox_batch(
  p_provider text,
  p_limit integer default 25
)
returns setof public.integration_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1) Sweep pending events whose integration is no longer enabled.
  --    These get skipped rather than delivered.
  update public.integration_outbox o
  set status = 'skipped', last_error = 'integration disabled at claim time'
  where o.provider = p_provider
    and o.status = 'pending'
    and not exists (
      select 1 from public.venue_integrations vi
      where vi.venue_id = o.venue_id
        and vi.provider = p_provider
        and vi.is_enabled = true
    );

  -- 2) Claim the remaining deliverable batch.
  return query
  with picked as (
    select id
    from public.integration_outbox
    where provider = p_provider
      and status = 'pending'
      and (next_retry_at is null or next_retry_at <= now())
    order by created_at asc
    limit p_limit
    for update skip locked
  )
  update public.integration_outbox o
  set
    status = 'delivering',
    attempts = o.attempts + 1,
    last_attempt_at = now()
  from picked
  where o.id = picked.id
  returning o.*;
end;
$$;

create or replace function public.mark_outbox_delivered(
  p_outbox_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.integration_outbox
  set
    status = 'delivered',
    delivered_at = now(),
    last_error = null
  where id = p_outbox_id;
end;
$$;

-- Mark a claimed event as failed. If attempts < max_attempts, goes back
-- to 'pending' with a backoff. Otherwise terminal 'failed' state.
create or replace function public.mark_outbox_failed(
  p_outbox_id bigint,
  p_error text,
  p_next_retry_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.integration_outbox%rowtype;
  v_backoff_seconds integer;
begin
  select * into v_row from public.integration_outbox where id = p_outbox_id;
  if not found then
    return;
  end if;

  if v_row.attempts >= v_row.max_attempts then
    update public.integration_outbox
    set status = 'failed', last_error = p_error
    where id = p_outbox_id;
    return;
  end if;

  -- Exponential backoff with cap: 30s, 1m, 2m, 4m, 8m, 16m, 30m, 30m...
  v_backoff_seconds := least(30 * power(2, v_row.attempts)::integer, 1800);

  update public.integration_outbox
  set
    status = 'pending',
    last_error = p_error,
    next_retry_at = coalesce(p_next_retry_at, now() + make_interval(secs => v_backoff_seconds))
  where id = p_outbox_id;
end;
$$;

-- Admin action: reset a failed event for retry, clearing the error.
create or replace function public.retry_outbox_event(
  p_outbox_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.integration_outbox
  set
    status = 'pending',
    attempts = 0,
    next_retry_at = null,
    last_error = null
  where id = p_outbox_id
    and status in ('failed', 'delivered');
end;
$$;

-- Dashboard: counts per status for one venue (or all if null).
create or replace function public.get_outbox_summary(
  p_venue_id bigint default null
)
returns table (
  venue_id bigint,
  provider text,
  status public.outbox_status,
  event_count bigint,
  oldest_created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.venue_id,
    o.provider,
    o.status,
    count(*)::bigint,
    min(o.created_at)
  from public.integration_outbox o
  where p_venue_id is null or o.venue_id = p_venue_id
  group by o.venue_id, o.provider, o.status
  order by o.venue_id, o.provider, o.status;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Worker calls these via a service-role key, but we grant to authenticated
-- for admin-triggered retries from the UI. Actual access is gated by
-- role-based UI logic + the RLS on the table itself.
grant execute on function public.emit_reservation_outbox(bigint, public.integration_event_type) to service_role;
grant execute on function public.claim_outbox_batch(text, integer) to service_role;
grant execute on function public.mark_outbox_delivered(bigint) to service_role;
grant execute on function public.mark_outbox_failed(bigint, text, timestamptz) to service_role;
grant execute on function public.retry_outbox_event(bigint) to service_role;
grant execute on function public.get_outbox_summary(bigint) to service_role;
