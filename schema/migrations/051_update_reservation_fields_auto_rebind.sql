-- ============================================================================
-- Migration 051: auto-rebind tables on time / party-size change
-- ============================================================================
-- update_reservation_fields used to "extend in place" — it only ran
--   UPDATE reservation_tables SET starts_at=…, ends_at=… WHERE reservation_id=X
-- which 23P01-fails if any of the reservation's CURRENT tables are already
-- booked by someone else in the new window.  Operationally that means: on a
-- busy night, editing "18:00–20:00 → 18:00–22:00" gets rejected with a cryptic
-- "Time slot is already occupied" — even though the venue has plenty of free
-- tables.  Staff has to manually find new tables and use the Reassign flow.
--
-- New behaviour: when the schedule changes, the function first checks whether
-- the current bindings can absorb the new window AND party size.  If yes, it
-- just shifts the window like before.  If not (any current table is taken in
-- the new range, or total capacity falls short of the new party size), it
-- asks find_best_table_combination for a fresh set of free tables on the same
-- venue, atomically releases the old bindings, inserts the new ones, and logs
-- a `reassigned` event so the move is auditable.  Only if no combination fits
-- does it raise — and with a clearer message than 23P01.
--
-- Signature, grants and "validate window" semantics are unchanged so existing
-- callers and tests keep working.
-- ============================================================================

begin;

create or replace function public.update_reservation_fields(
  p_reservation_id     bigint,
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
  v_res                public.reservations%rowtype;
  v_new_starts         timestamptz;
  v_new_ends           timestamptz;
  v_new_party          integer;
  v_venue_id           bigint;
  v_schedule_changed   boolean;
  v_party_changed      boolean;
  v_current_table_ids  bigint[];
  v_current_capacity   integer;
  v_current_tables_free boolean;
  v_combo              record;
  v_old_table_names    text[];
  v_new_table_names    text[];
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

  -- Customer fields (unchanged)
  if p_customer_full_name is not null or p_customer_phone is not null or p_customer_email is not null then
    update public.customers
    set
      full_name = coalesce(p_customer_full_name, full_name),
      phone     = coalesce(p_customer_phone,     phone),
      email     = coalesce(p_customer_email,     email)
    where id = v_res.customer_id;
  end if;

  -- Reservation row update (unchanged)
  update public.reservations
  set
    party_size       = coalesce(p_party_size,       party_size),
    special_requests = coalesce(p_special_requests, special_requests),
    internal_notes   = coalesce(p_internal_notes,   internal_notes),
    starts_at        = v_new_starts,
    ends_at          = v_new_ends
  where id = p_reservation_id;

  -- ── Auto-rebind: only on schedule or party change ──────────────────────
  if v_schedule_changed or v_party_changed then
    select coalesce(array_agg(rt.table_id order by rt.table_id), array[]::bigint[])
      into v_current_table_ids
    from public.reservation_tables rt
    where rt.reservation_id = p_reservation_id and rt.released_at is null;

    if coalesce(array_length(v_current_table_ids, 1), 0) = 0 then
      -- No active table bindings (e.g. pending_manual_review with nothing
      -- assigned yet).  Nothing to shift; staff will assign later through
      -- the overflow flow.
      null;
    else
      -- Are all the current tables still free for the new window
      -- (excluding this reservation's own bindings)?
      v_current_tables_free := not exists (
        select 1
        from public.reservation_tables other
        where other.table_id = any (v_current_table_ids)
          and other.reservation_id <> p_reservation_id
          and other.released_at is null
          and other.starts_at < v_new_ends
          and other.ends_at   > v_new_starts
      );

      -- Does the current set still have enough capacity for the (possibly
      -- larger) party?
      select coalesce(sum(t.capacity_max), 0)
        into v_current_capacity
      from public.tables t
      where t.id = any (v_current_table_ids);

      if v_current_tables_free and v_current_capacity >= v_new_party then
        -- Easy path: keep the same tables, just shift the window.
        update public.reservation_tables rt
        set starts_at = v_new_starts, ends_at = v_new_ends
        where rt.reservation_id = p_reservation_id and rt.released_at is null;
      else
        -- Current tables don't fit the new window/party.  Ask the
        -- allocator for a fresh combination on the same venue, excluding
        -- this reservation's own bindings so it sees its current rows as
        -- "free".
        select *
          into v_combo
        from public.find_best_table_combination(
          v_venue_id,
          v_res.requested_table_type_id,
          v_new_starts,
          v_new_ends,
          v_new_party,
          null,                  -- p_area: don't constrain on rebind
          p_reservation_id       -- exclude self
        );

        if v_combo.table_ids is null
           or coalesce(array_length(v_combo.table_ids, 1), 0) = 0 then
          raise exception
            'no free table combination fits party % between % and % at this venue',
            v_new_party, v_new_starts, v_new_ends;
        end if;

        -- Capture old/new names for the audit row.
        select array_agg(t.name order by t.sort_order, t.id)
          into v_old_table_names
        from public.tables t where t.id = any (v_current_table_ids);

        select array_agg(t.name order by t.sort_order, t.id)
          into v_new_table_names
        from public.tables t where t.id = any (v_combo.table_ids);

        -- Atomically release old bindings and bind the new ones in the
        -- new window.  If a race causes 23P01 here, the whole function
        -- rolls back as before — no half-applied state.
        update public.reservation_tables rt
        set released_at = now()
        where rt.reservation_id = p_reservation_id and rt.released_at is null;

        insert into public.reservation_tables (reservation_id, table_id, venue_id, starts_at, ends_at)
        select p_reservation_id, t_id, v_venue_id, v_new_starts, v_new_ends
        from unnest(v_combo.table_ids) t_id;

        insert into public.reservation_events (reservation_id, event_type, old_value, new_value)
        values (
          p_reservation_id,
          'reassigned',
          jsonb_build_object(
            'table_ids',   v_current_table_ids,
            'table_names', v_old_table_names
          ),
          jsonb_build_object(
            'table_ids',   v_combo.table_ids,
            'table_names', v_new_table_names,
            'reason',      'auto_rebind_on_edit',
            'starts_at',   v_new_starts,
            'ends_at',     v_new_ends
          )
        );
      end if;
    end if;
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

-- Re-apply the lockdown grants from migration 042 / 049 so the signature
-- replacement doesn't leak public/authenticated execute privileges.
revoke execute on function public.update_reservation_fields(
  bigint, text, text, text, integer, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant  execute on function public.update_reservation_fields(
  bigint, text, text, text, integer, text, text, timestamptz, timestamptz
) to service_role;

commit;
