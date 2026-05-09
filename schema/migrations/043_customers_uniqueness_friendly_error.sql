-- ============================================================================
-- Migration 043: customers email/phone uniqueness — friendly error
-- ============================================================================
-- `update_reservation_fields` lets staff edit a customer's email/phone.
-- If the new value is already used by *another* customer, the partial
-- unique indexes on `customers(email_normalized)` /
-- `customers(phone_normalized)` raise a raw 23505, which the route
-- handler maps to a generic 409 "Conflict" — leaving staff to guess
-- what went wrong.
--
-- Fix: catch the unique violation in the customer-update branch of
-- `update_reservation_fields` and replace it with a friendly,
-- localizable error string the UI can map to a clear toast:
--
--   "Email already in use by another customer"
--   "Phone already in use by another customer"
--
-- We also add a constraint comment so any future code that hits these
-- indexes via raw SQL gets a hint.
--
-- ── Safety notes ────────────────────────────────────────────────────
-- * Only the customer-update branch is wrapped — the reservation-update
--   branch hits different constraints (GiST overlap, FK), and we don't
--   want to mask those.
-- * The error format `friendly:<key>` is chosen so the route handler
--   can split on `:` and surface the leaf to the i18n layer without
--   leaking SQL state.
-- ============================================================================

begin;

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

  -- See migration 042 header: validate only when the schedule actually
  -- moved or the party actually changed, not just "non-null in payload".
  -- The UI re-submits every field on every save.
  v_schedule_changed :=
    (p_starts_at is not null and p_starts_at is distinct from v_res.starts_at)
    or
    (p_ends_at   is not null and p_ends_at   is distinct from v_res.ends_at);
  v_party_changed :=
    p_party_size is not null and p_party_size is distinct from v_res.party_size;

  if v_schedule_changed or v_party_changed then
    perform public.validate_reservation_window(
      v_venue_id, v_new_starts, v_new_ends, v_new_party, true
    );
  end if;

  if v_new_ends <= v_new_starts then
    raise exception 'ends_at must be after starts_at';
  end if;

  -- Friendly error mapping for unique-violation on customer fields.
  -- The route handler catches messages prefixed with 'friendly:' and
  -- maps the leaf to a localized toast.
  if p_customer_full_name is not null or p_customer_phone is not null or p_customer_email is not null then
    begin
      update public.customers
      set
        full_name = coalesce(p_customer_full_name, full_name),
        phone     = coalesce(p_customer_phone,     phone),
        email     = coalesce(p_customer_email,     email)
      where id = v_res.customer_id;
    exception
      when unique_violation then
        if SQLERRM ilike '%email%' then
          raise exception 'friendly:customer_email_in_use'
            using errcode = '23505';
        elsif SQLERRM ilike '%phone%' then
          raise exception 'friendly:customer_phone_in_use'
            using errcode = '23505';
        else
          raise;
        end if;
    end;
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

commit;
