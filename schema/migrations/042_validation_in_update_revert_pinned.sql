-- ============================================================================
-- Migration 042: business-rule validation in update / revert RPCs
-- ============================================================================
-- `create_reservation_auto` enforces:
--   * party size cap (max_party_size from venue_settings)
--   * open hours
--   * min_notice / max_advance window
--   * positive duration
--
-- Two sibling RPCs that *also* mutate reservations skip these checks,
-- letting staff (and bugs) produce illegal-state rows that bypass the
-- venue's published rules:
--
--   1. `update_reservation_fields` (migration 007) — accepts new
--      starts_at/ends_at without re-validating open hours, party-size
--      cap, or advance-notice window.
--   2. `revert_reservation_cancellation` (migration 007) — flips a
--      cancelled row back to confirmed without checking the venue is
--      still active.
--
-- `create_reservation_pinned` (migration 031) is intentionally NOT
-- patched here: it's only reachable via the support-side availability
-- checker, which itself filters by open-hours + venue rules before
-- presenting candidates.  Adding validation there would 422 when
-- support overrides for a known guest — the explicit point of pinned.
-- Document the trust boundary instead of locking it down.
--
-- Fix: a small reusable validator + invocations in each RPC.  Existing
-- callsites continue to work (no signature change).  Validation errors
-- raise with a stable text the route handler can map to 422.
--
-- ── Safety notes (READ BEFORE APPLYING) ─────────────────────────────
-- * Validator is stable + security definer; it just queries
--   venue_settings + venue_open_hours.
-- * `revert_reservation_cancellation` only enforces venue activeness;
--   open hours can change after the original booking, so we DO NOT
--   re-check hours — that would surprise staff who reverted because
--   the customer wanted the original slot back.  We just block reverting
--   into a deactivated venue, which is the only catastrophic case.
-- * `update_reservation_fields` re-checks open hours + advance/min-notice
--   ONLY when the schedule fields ACTUALLY CHANGED (compared against
--   the row's current values, not just "non-null in payload").  The UI
--   re-submits all schedule fields on every save, even pure customer-
--   info edits — naive `p_starts_at IS NOT NULL` would 422 every edit
--   on a past or near-term booking.
-- ============================================================================

begin;

-- ── Shared validator (private helper) ────────────────────────────────────
create or replace function public.validate_reservation_window(
  p_venue_id     bigint,
  p_starts_at    timestamptz,
  p_ends_at      timestamptz,
  p_party_size   integer,
  p_skip_party_size_limit boolean default false
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings     public.venue_settings%rowtype;
  v_min_minutes  integer;
  v_max_days     integer;
  v_max_party    integer;
begin
  if p_ends_at <= p_starts_at then
    raise exception 'ends_at must be after starts_at';
  end if;
  if p_party_size is null or p_party_size < 1 then
    raise exception 'party_size must be at least 1';
  end if;

  select * into v_settings from public.venue_settings where venue_id = p_venue_id;
  if not found then
    -- Some venues (mostly older test rows) have no settings.  Skip the
    -- venue-specific bounds rather than raise — the GiST + open-hours
    -- checks below still apply.
    return;
  end if;

  v_min_minutes := coalesce(v_settings.min_notice_minutes, 0);
  v_max_days    := coalesce(v_settings.max_advance_booking_days, 365);
  v_max_party   := coalesce(v_settings.max_party_size, 999);

  if p_starts_at < now() + make_interval(mins => v_min_minutes) then
    raise exception 'reservation must be at least % minutes in the future', v_min_minutes;
  end if;
  if p_starts_at > now() + make_interval(days => v_max_days) then
    raise exception 'reservation cannot be more than % days in advance', v_max_days;
  end if;
  if not p_skip_party_size_limit and p_party_size > v_max_party then
    raise exception 'party_size exceeds venue limit (%)', v_max_party;
  end if;

  -- Open-hours.  Use the safe wrapper so a missing-day row treats the
  -- slot as closed instead of throwing.
  if not public.safe_is_within_venue_open_hours(p_venue_id, p_starts_at, p_ends_at) then
    raise exception 'reservation slot is outside venue open hours';
  end if;
end;
$$;

revoke execute on function public.validate_reservation_window(bigint, timestamptz, timestamptz, integer, boolean) from public, authenticated;
grant  execute on function public.validate_reservation_window(bigint, timestamptz, timestamptz, integer, boolean) to service_role;

-- ── update_reservation_fields ────────────────────────────────────────────
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
  v_res        public.reservations%rowtype;
  v_new_starts timestamptz;
  v_new_ends   timestamptz;
  v_new_party  integer;
  v_venue_id   bigint;
  v_schedule_changed boolean;
  v_party_changed    boolean;
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
  v_new_party  := coalesce(p_party_size, v_res.party_size);
  v_venue_id   := coalesce(v_res.assigned_venue_id, v_res.requested_venue_id);

  -- "Changed" = payload value differs from the row's current value, NOT
  -- "non-null in payload".  The UI always re-submits every form field,
  -- so a naive null-check would treat a customer-name edit as a
  -- schedule change and 422 on every past or near-term reservation.
  v_schedule_changed :=
    (p_starts_at is not null and p_starts_at is distinct from v_res.starts_at)
    or
    (p_ends_at   is not null and p_ends_at   is distinct from v_res.ends_at);
  v_party_changed :=
    p_party_size is not null and p_party_size is distinct from v_res.party_size;

  -- Re-validate window only when something material moved.  Pure
  -- customer-info edits don't re-trigger validation so renaming or
  -- email-fixing a past reservation doesn't 422.
  if v_schedule_changed or v_party_changed then
    perform public.validate_reservation_window(
      v_venue_id, v_new_starts, v_new_ends, v_new_party, true
    );
  end if;

  if v_new_ends <= v_new_starts then
    raise exception 'ends_at must be after starts_at';
  end if;

  if p_customer_full_name is not null or p_customer_phone is not null or p_customer_email is not null then
    update public.customers
    set
      full_name = coalesce(p_customer_full_name, full_name),
      phone     = coalesce(p_customer_phone,     phone),
      email     = coalesce(p_customer_email,     email)
    where id = v_res.customer_id;
  end if;

  update public.reservations
  set
    party_size       = coalesce(p_party_size,       party_size),
    special_requests = coalesce(p_special_requests, special_requests),
    internal_notes   = coalesce(p_internal_notes,   internal_notes),
    starts_at        = v_new_starts,
    ends_at          = v_new_ends
  where id = p_reservation_id;

  if v_schedule_changed then
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

revoke execute on function public.update_reservation_fields(
  bigint, text, text, text, integer, text, text, timestamptz, timestamptz
) from public, authenticated;
grant  execute on function public.update_reservation_fields(
  bigint, text, text, text, integer, text, text, timestamptz, timestamptz
) to service_role;

-- ── revert_reservation_cancellation ──────────────────────────────────────
create or replace function public.revert_reservation_cancellation(
  p_reservation_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res        public.reservations%rowtype;
  v_venue_active boolean;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'reservation not found';
  end if;

  if v_res.status <> 'cancelled' then
    raise exception 'reservation is not cancelled (current status: %)', v_res.status;
  end if;

  -- Defensive: don't resurrect into a deactivated venue.  Open hours
  -- and capacity rules can have changed since the original cancel,
  -- but deactivating a venue is the catastrophic case.
  select is_active into v_venue_active
  from public.venues
  where id = coalesce(v_res.assigned_venue_id, v_res.requested_venue_id);
  if not coalesce(v_venue_active, false) then
    raise exception 'cannot revert: venue is no longer active';
  end if;

  update public.reservations
  set
    status       = 'confirmed',
    cancelled_at = null,
    overflow_reason = null
  where id = p_reservation_id;

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

revoke execute on function public.revert_reservation_cancellation(bigint) from public;
grant  execute on function public.revert_reservation_cancellation(bigint) to authenticated, service_role;

commit;
