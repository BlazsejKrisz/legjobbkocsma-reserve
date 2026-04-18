-- ============================================================================
-- Migration 007: Venue groups, revert cancellation, full reservation editing
-- ============================================================================

-- ─── 1. Venue groups ─────────────────────────────────────────────────────────

create table public.venue_groups (
  id          bigserial primary key,
  name        text      not null,
  created_at  timestamptz not null default now()
);

create table public.venue_group_members (
  id        bigserial primary key,
  group_id  bigint not null references public.venue_groups(id) on delete cascade,
  venue_id  bigint not null references public.venues(id) on delete cascade,
  priority  integer not null default 0,
  unique (group_id, venue_id)
);

create index idx_vgm_group   on public.venue_group_members(group_id, priority);
create index idx_vgm_venue   on public.venue_group_members(venue_id);

-- RLS
alter table public.venue_groups        enable row level security;
alter table public.venue_group_members enable row level security;

create policy "authenticated can read venue_groups"
  on public.venue_groups for select
  to authenticated
  using (true);

create policy "super_admin can manage venue_groups"
  on public.venue_groups for all
  to authenticated
  using   (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

create policy "authenticated can read venue_group_members"
  on public.venue_group_members for select
  to authenticated
  using (true);

create policy "super_admin can manage venue_group_members"
  on public.venue_group_members for all
  to authenticated
  using   (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

-- ─── 2. Reorder group members (atomic bulk priority update) ──────────────────

create or replace function public.reorder_group_members(
  p_group_id          bigint,
  p_ordered_venue_ids bigint[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.venue_group_members vgm
  set priority = ord.ordinality - 1
  from unnest(p_ordered_venue_ids) with ordinality as ord(venue_id, ordinality)
  where vgm.group_id = p_group_id
    and vgm.venue_id = ord.venue_id;
end;
$$;

grant execute on function public.reorder_group_members(bigint, bigint[]) to authenticated;

-- ─── 3. New event type values ─────────────────────────────────────────────────

alter type public.reservation_event_type add value if not exists 'reverted';
alter type public.reservation_event_type add value if not exists 'fields_updated';

-- ─── 4. Revert reservation cancellation ──────────────────────────────────────
-- Re-activates soft-released reservation_tables rows. If any of those rows
-- now overlap an existing live reservation the GiST exclusion constraint
-- raises a 23P01 — the API maps this to 409 "Time slot is already occupied".

create or replace function public.revert_reservation_cancellation(
  p_reservation_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.reservations%rowtype;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'reservation not found';
  end if;

  if v_res.status <> 'cancelled' then
    raise exception 'reservation is not cancelled (current status: %)', v_res.status;
  end if;

  update public.reservations
  set
    status       = 'confirmed',
    cancelled_at = null,
    overflow_reason = null
  where id = p_reservation_id;

  -- Re-activate table assignments — GiST will catch conflicts.
  update public.reservation_tables rt
  set released_at = null
  where rt.reservation_id = p_reservation_id;

  insert into public.reservation_events (reservation_id, event_type, old_value, new_value)
  values (
    p_reservation_id,
    'reverted',
    jsonb_build_object('status', 'cancelled'),
    jsonb_build_object('status', 'confirmed')
  );
end;
$$;

grant execute on function public.revert_reservation_cancellation(bigint) to authenticated;

-- ─── 5. Full reservation field editing ───────────────────────────────────────
-- Patches any combination of customer fields + reservation fields atomically.
-- Also updates reservation_tables time window if starts_at/ends_at change,
-- so the GiST exclusion constraint can detect collisions.

create or replace function public.update_reservation_fields(
  p_reservation_id    bigint,
  p_customer_full_name text       default null,
  p_customer_phone     text       default null,
  p_customer_email     text       default null,
  p_party_size         integer    default null,
  p_special_requests   text       default null,
  p_internal_notes     text       default null,
  p_starts_at          timestamptz default null,
  p_ends_at            timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res       public.reservations%rowtype;
  v_new_starts timestamptz;
  v_new_ends   timestamptz;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'reservation not found';
  end if;

  if v_res.status = 'cancelled' then
    raise exception 'cannot edit a cancelled reservation';
  end if;

  v_new_starts := coalesce(p_starts_at, v_res.starts_at);
  v_new_ends   := coalesce(p_ends_at,   v_res.ends_at);

  if v_new_ends <= v_new_starts then
    raise exception 'ends_at must be after starts_at';
  end if;

  -- Update customer fields if any provided
  if p_customer_full_name is not null or p_customer_phone is not null or p_customer_email is not null then
    update public.customers
    set
      full_name = coalesce(p_customer_full_name, full_name),
      phone     = coalesce(p_customer_phone,     phone),
      email     = coalesce(p_customer_email,     email)
    where id = v_res.customer_id;
  end if;

  -- Update reservation fields
  update public.reservations
  set
    party_size       = coalesce(p_party_size,       party_size),
    special_requests = coalesce(p_special_requests, special_requests),
    internal_notes   = coalesce(p_internal_notes,   internal_notes),
    starts_at        = v_new_starts,
    ends_at          = v_new_ends
  where id = p_reservation_id;

  -- Keep reservation_tables in sync so GiST constraint stays accurate
  if p_starts_at is not null or p_ends_at is not null then
    update public.reservation_tables rt
    set
      starts_at = v_new_starts,
      ends_at   = v_new_ends
    where rt.reservation_id = p_reservation_id
      and rt.released_at is null;
  end if;

  insert into public.reservation_events (reservation_id, event_type, new_value)
  values (
    p_reservation_id,
    'fields_updated',
    jsonb_strip_nulls(jsonb_build_object(
      'customer_full_name', p_customer_full_name,
      'customer_phone',     p_customer_phone,
      'customer_email',     p_customer_email,
      'party_size',         p_party_size,
      'special_requests',   p_special_requests,
      'internal_notes',     p_internal_notes,
      'starts_at',          p_starts_at,
      'ends_at',            p_ends_at
    ))
  );
end;
$$;

grant execute on function public.update_reservation_fields(bigint, text, text, text, integer, text, text, timestamptz, timestamptz) to authenticated;
