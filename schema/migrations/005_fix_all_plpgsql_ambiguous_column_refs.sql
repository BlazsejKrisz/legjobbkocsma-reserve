-- ============================================================================
-- Migration 005: Fix ALL remaining "column reference is ambiguous" (42702)
--                errors caused by RETURNS TABLE output column names shadowing
--                table column names inside function bodies.
--
-- Pattern: RETURNS TABLE (col_name ...) creates an implicit PL/pgSQL variable
-- named col_name. Any bare reference to col_name in SQL statements inside the
-- body is then ambiguous between the output variable and the table column.
--
-- Affected functions and specific references:
--
--   reassign_reservation
--     • UPDATE reservation_tables … WHERE reservation_id = …
--       (output col `reservation_id` vs reservation_tables.reservation_id)
--     • UPDATE reservations SET … ELSE manual_confirmation_email_sent_at
--       (output col vs reservations.manual_confirmation_email_sent_at)
--     • SELECT manual_confirmation_email_sent_at … FROM reservations
--       (same)
--
--   cancel_reservation
--     • UPDATE reservation_tables … WHERE reservation_id = …
--       (same pattern as reassign_reservation)
--
--   mark_confirmation_email_sent
--     • UPDATE reservations SET auto/manual_… = CASE … ELSE auto/manual_…
--       (output cols vs reservations columns)
--     • SELECT auto/manual_… FROM reservations
--       (same)
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. reassign_reservation
-- ---------------------------------------------------------------------------
create or replace function public.reassign_reservation(
  p_reservation_id bigint,
  p_new_venue_id bigint,
  p_new_table_ids bigint[],
  p_new_starts_at timestamptz,
  p_send_manual_confirmation boolean default false,
  p_customer_service_notes text default null
)
returns table (
  reservation_id bigint,
  status public.reservation_status,
  assigned_venue_id bigint,
  manual_confirmation_email_sent_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.reservations%rowtype;
  v_duration interval;
  v_new_ends_at timestamptz;
  v_manual_sent_at timestamptz;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'reservation not found';
  end if;

  if v_res.status = 'cancelled' then
    raise exception 'cannot reassign cancelled reservation';
  end if;

  if p_new_table_ids is null or array_length(p_new_table_ids, 1) is null then
    raise exception 'at least one table is required';
  end if;

  v_duration := v_res.ends_at - v_res.starts_at;
  v_new_ends_at := p_new_starts_at + v_duration;

  perform pg_advisory_xact_lock(p_new_venue_id);

  if not exists (
    select 1
    from unnest(p_new_table_ids) as t(id)
    join public.tables pt on pt.id = t.id
    where pt.venue_id = p_new_venue_id and pt.is_active = true
  ) or (
    select count(*) from public.tables
    where id = any(p_new_table_ids) and venue_id = p_new_venue_id and is_active = true
  ) <> array_length(p_new_table_ids, 1) then
    raise exception 'one or more tables do not belong to venue or are inactive';
  end if;

  -- Qualify with table alias to avoid ambiguity with the `reservation_id` output column.
  update public.reservation_tables rt
  set released_at = now()
  where rt.reservation_id = p_reservation_id and rt.released_at is null;

  insert into public.reservation_tables (
    reservation_id, table_id, venue_id, starts_at, ends_at
  )
  select p_reservation_id, unnest(p_new_table_ids), p_new_venue_id, p_new_starts_at, v_new_ends_at;

  update public.reservations
  set
    assigned_venue_id = p_new_venue_id,
    starts_at = p_new_starts_at,
    ends_at = v_new_ends_at,
    status = 'confirmed',
    overflow_reason = null,
    customer_service_notes = coalesce(p_customer_service_notes, customer_service_notes),
    -- Use the already-fetched row variable to avoid ambiguity with the
    -- `manual_confirmation_email_sent_at` output column.
    manual_confirmation_email_sent_at = case
      when p_send_manual_confirmation then now()
      else v_res.manual_confirmation_email_sent_at
    end
  where id = p_reservation_id;

  -- Qualify with table alias to avoid ambiguity with the output column.
  select r.manual_confirmation_email_sent_at into v_manual_sent_at
  from public.reservations r where r.id = p_reservation_id;

  insert into public.reservation_events (
    reservation_id, event_type, old_value, new_value
  )
  values (
    p_reservation_id, 'reassigned',
    jsonb_build_object(
      'assigned_venue_id', v_res.assigned_venue_id,
      'starts_at', v_res.starts_at,
      'ends_at', v_res.ends_at
    ),
    jsonb_build_object(
      'assigned_venue_id', p_new_venue_id,
      'table_ids', to_jsonb(p_new_table_ids),
      'starts_at', p_new_starts_at,
      'ends_at', v_new_ends_at,
      'manual_confirmation_email_sent', p_send_manual_confirmation
    )
  );

  if p_send_manual_confirmation then
    insert into public.reservation_events (reservation_id, event_type, new_value)
    values (p_reservation_id, 'confirmation_email_sent', jsonb_build_object('mode', 'manual'));
  end if;

  reservation_id                    := p_reservation_id;
  status                            := 'confirmed';
  assigned_venue_id                 := p_new_venue_id;
  manual_confirmation_email_sent_at := v_manual_sent_at;
  return next;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. cancel_reservation
-- ---------------------------------------------------------------------------
create or replace function public.cancel_reservation(
  p_reservation_id bigint,
  p_note text default null
)
returns table (
  reservation_id bigint,
  status public.reservation_status,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cancelled_at timestamptz;
begin
  update public.reservations
  set
    status = 'cancelled',
    cancelled_at = now(),
    internal_notes = case
      when p_note is null then internal_notes
      when internal_notes is null then p_note
      else internal_notes || E'\n' || p_note
    end
  where id = p_reservation_id and status <> 'cancelled';

  if not found then
    raise exception 'reservation not found or already cancelled';
  end if;

  -- Qualify with table alias to avoid ambiguity with the `reservation_id` output column.
  update public.reservation_tables rt
  set released_at = now()
  where rt.reservation_id = p_reservation_id and rt.released_at is null;

  select r.cancelled_at into v_cancelled_at
  from public.reservations r where r.id = p_reservation_id;

  insert into public.reservation_events (reservation_id, event_type, new_value)
  values (p_reservation_id, 'cancelled', jsonb_build_object('note', p_note));

  reservation_id := p_reservation_id;
  status         := 'cancelled';
  cancelled_at   := v_cancelled_at;
  return next;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. mark_confirmation_email_sent
-- ---------------------------------------------------------------------------
create or replace function public.mark_confirmation_email_sent(
  p_reservation_id bigint,
  p_mode text
)
returns table (
  reservation_id bigint,
  auto_confirmation_email_sent_at timestamptz,
  manual_confirmation_email_sent_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auto   timestamptz;
  v_manual timestamptz;
begin
  if p_mode not in ('auto', 'manual') then
    raise exception 'invalid mode';
  end if;

  -- Split into two targeted UPDATEs to avoid referencing the output column
  -- names (`auto_confirmation_email_sent_at`, `manual_confirmation_email_sent_at`)
  -- unqualified in a CASE ELSE expression, which is ambiguous in PL/pgSQL.
  if p_mode = 'auto' then
    update public.reservations
    set auto_confirmation_email_sent_at = now()
    where id = p_reservation_id;
  else
    update public.reservations
    set manual_confirmation_email_sent_at = now()
    where id = p_reservation_id;
  end if;

  if not found then
    raise exception 'reservation not found';
  end if;

  -- Qualify with table alias to avoid ambiguity with the output columns.
  select r.auto_confirmation_email_sent_at, r.manual_confirmation_email_sent_at
    into v_auto, v_manual
  from public.reservations r where r.id = p_reservation_id;

  insert into public.reservation_events (reservation_id, event_type, new_value)
  values (p_reservation_id, 'confirmation_email_sent', jsonb_build_object('mode', p_mode));

  reservation_id                    := p_reservation_id;
  auto_confirmation_email_sent_at   := v_auto;
  manual_confirmation_email_sent_at := v_manual;
  return next;
end;
$$;


-- Re-grant execute on all three (same signatures — existing grants survive)
grant execute on function public.reassign_reservation(bigint, bigint, bigint[], timestamptz, boolean, text) to authenticated;
grant execute on function public.cancel_reservation(bigint, text) to authenticated;
grant execute on function public.mark_confirmation_email_sent(bigint, text) to authenticated;
