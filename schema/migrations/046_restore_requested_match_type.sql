-- ============================================================================
-- Migration 046: restore `match_type = 'requested'` from find_availability
-- ============================================================================
-- Migration 038 fixed the venue_group_members join, but accidentally
-- changed the match_type strings emitted by the function:
--
--    OLD (036, working):  match_type := 'requested'        for both single+combined
--    NEW (038, broken):   match_type := 'requested_single' / 'requested_combined'
--
-- Every consumer in the codebase filters on the literal `'requested'`:
--    * app/api/overflow/route.ts:65       (overflow queue "fits now" badge)
--    * components/reservations/ReservationDetail.tsx:282 (edit availability check)
--    * components/availability/AvailabilityChecker.tsx:60 (support availability UI)
--    * lib/hooks/availability/useAvailability.ts:13      (typed union)
--
-- Result: every frontend-visible badge / banner that reads
-- `match_type === 'requested'` returned ZERO rows, even when there
-- was plenty of capacity.  The DB function was emitting the right
-- data; the strings just didn't match what the UI was looking for.
--
-- Fix: revert match_type to plain `'requested'` for both branches.
-- Also restores the up-to-5-row fan-out that 036 had via FOR loop —
-- multiple available tables now show up as multiple options instead
-- of just the smallest-capacity one.  The venue_group_members fix
-- from 038 is preserved.
--
-- ── Safety notes ────────────────────────────────────────────────────
-- * No signature change; CREATE OR REPLACE keeps OID + grants stable.
-- * Same args, same return shape — only string values change.
-- * Re-grant explicitly to service_role for parity with migration 014.
-- ============================================================================

begin;

create or replace function public.find_availability_with_alternatives(
  p_venue_id                  bigint,
  p_starts_at                 timestamptz,
  p_duration_minutes          integer,
  p_party_size                integer,
  p_table_type_id             bigint  default null,
  p_area                      text    default null,
  p_alt_time_window_minutes   integer default 180,
  p_alt_time_step_minutes     integer default 30,
  p_exclude_reservation_id    bigint  default null
)
returns table (
  match_type        text,
  ord               integer,
  venue_id          bigint,
  venue_name        text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  table_ids         bigint[],
  combined          boolean,
  capacity_min      integer,
  capacity_max      integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ends_at        timestamptz;
  v_step_offset    integer;
  v_alt_starts     timestamptz;
  v_alt_ends       timestamptz;
  v_combo          bigint[];
  v_combo_cap_min  integer;
  v_combo_cap_max  integer;
  v_sibling        record;
  v_found_any      boolean;
  v_ord            integer := 0;
begin
  v_ends_at := p_starts_at + make_interval(mins => p_duration_minutes);

  -- ── REQUESTED slot ─────────────────────────────────────────────────────
  -- Up to 5 single-table matches, ordered smallest-capacity-first so the
  -- best fit appears first in the UI.  Plus a combined-table fallback if
  -- a single table is too small but multiple stitched together work.
  if public.safe_is_within_venue_open_hours(p_venue_id, p_starts_at, v_ends_at) then

    for venue_id, venue_name, starts_at, ends_at, table_ids, combined,
        capacity_min, capacity_max in
      select
        p_venue_id, v.name, p_starts_at, v_ends_at,
        array[s.table_id]::bigint[], false,
        s.capacity_min::integer, s.capacity_max::integer
      from public.venues v
      cross join public.get_available_single_table_matches(
        p_venue_id, p_table_type_id, p_starts_at, v_ends_at, p_party_size, p_area,
        p_exclude_reservation_id
      ) s
      where v.id = p_venue_id
      order by s.capacity_max asc
      limit 5
    loop
      v_ord := v_ord + 1;
      match_type := 'requested';
      ord        := v_ord;
      return next;
    end loop;

    select c.table_ids, c.total_capacity, c.total_capacity
      into v_combo, v_combo_cap_min, v_combo_cap_max
    from public.find_best_table_combination(
      p_venue_id, p_table_type_id, p_starts_at, v_ends_at, p_party_size, p_area,
      p_exclude_reservation_id
    ) c
    limit 1;

    if v_combo is not null and array_length(v_combo, 1) > 1 then
      v_ord := v_ord + 1;
      match_type    := 'requested';
      ord           := v_ord;
      venue_id      := p_venue_id;
      select v.name into venue_name from public.venues v where v.id = p_venue_id;
      starts_at     := p_starts_at;
      ends_at       := v_ends_at;
      table_ids     := v_combo;
      combined      := true;
      capacity_min  := v_combo_cap_min;
      capacity_max  := v_combo_cap_max;
      return next;
    end if;
  end if;

  v_found_any := v_ord > 0;
  if v_found_any then return; end if;

  -- ── ALT TIMES at same venue ────────────────────────────────────────────
  -- Same venue, time shifted ±window in step increments.  Skip slots that
  -- aren't within the venue's open hours.  Order by absolute offset so
  -- closer-to-asked alternatives surface first.
  for v_step_offset in
    select t.offset_min
    from generate_series(
      -p_alt_time_window_minutes,
       p_alt_time_window_minutes,
       p_alt_time_step_minutes
    ) t(offset_min)
    where t.offset_min <> 0
    order by abs(t.offset_min)
    limit 12
  loop
    v_alt_starts := p_starts_at + make_interval(mins => v_step_offset);
    v_alt_ends   := v_alt_starts + make_interval(mins => p_duration_minutes);

    if not public.safe_is_within_venue_open_hours(p_venue_id, v_alt_starts, v_alt_ends) then
      continue;
    end if;

    select
      p_venue_id, v.name, v_alt_starts, v_alt_ends,
      array[s.table_id]::bigint[], false,
      s.capacity_min::integer, s.capacity_max::integer
      into venue_id, venue_name, starts_at, ends_at,
           table_ids, combined, capacity_min, capacity_max
    from public.venues v
    cross join public.get_available_single_table_matches(
      p_venue_id, p_table_type_id, v_alt_starts, v_alt_ends, p_party_size, p_area,
      p_exclude_reservation_id
    ) s
    where v.id = p_venue_id
    order by s.capacity_max asc
    limit 1;

    if found then
      v_ord := v_ord + 1;
      match_type := 'alt_time';
      ord        := v_ord;
      return next;
    else
      select c.table_ids, c.total_capacity, c.total_capacity
        into v_combo, v_combo_cap_min, v_combo_cap_max
      from public.find_best_table_combination(
        p_venue_id, p_table_type_id, v_alt_starts, v_alt_ends, p_party_size, p_area,
        p_exclude_reservation_id
      ) c
      limit 1;

      if v_combo is not null and array_length(v_combo, 1) > 0 then
        v_ord := v_ord + 1;
        match_type    := 'alt_time';
        ord           := v_ord;
        venue_id      := p_venue_id;
        select v.name into venue_name from public.venues v where v.id = p_venue_id;
        starts_at     := v_alt_starts;
        ends_at       := v_alt_ends;
        table_ids     := v_combo;
        combined      := true;
        capacity_min  := v_combo_cap_min;
        capacity_max  := v_combo_cap_max;
        return next;
      end if;
    end if;

    exit when v_ord >= 6;
  end loop;

  -- ── ALT VENUES (siblings via venue_group_members) at requested time ──
  -- M:N relation walk.  Migration 038 fixed the original venue_group_id
  -- bug (the column doesn't exist on `venues`); this version preserves
  -- that fix while restoring the rest of 036's behaviour.
  for v_sibling in
    select distinct v.id, v.name
    from public.venue_group_members vgm_origin
    join public.venue_group_members vgm_sibling
      on vgm_sibling.group_id = vgm_origin.group_id
     and vgm_sibling.venue_id <> vgm_origin.venue_id
    join public.venues v on v.id = vgm_sibling.venue_id
    where vgm_origin.venue_id = p_venue_id
      and v.is_active = true
    order by v.id
  loop
    if not public.safe_is_within_venue_open_hours(v_sibling.id, p_starts_at, v_ends_at) then
      continue;
    end if;

    select
      v_sibling.id, v_sibling.name, p_starts_at, v_ends_at,
      array[s.table_id]::bigint[], false,
      s.capacity_min::integer, s.capacity_max::integer
      into venue_id, venue_name, starts_at, ends_at,
           table_ids, combined, capacity_min, capacity_max
    from public.get_available_single_table_matches(
      v_sibling.id, p_table_type_id, p_starts_at, v_ends_at, p_party_size, p_area,
      p_exclude_reservation_id
    ) s
    order by s.capacity_max asc
    limit 1;

    if found then
      v_ord := v_ord + 1;
      match_type := 'alt_venue';
      ord        := v_ord;
      return next;
    else
      select c.table_ids, c.total_capacity, c.total_capacity
        into v_combo, v_combo_cap_min, v_combo_cap_max
      from public.find_best_table_combination(
        v_sibling.id, p_table_type_id, p_starts_at, v_ends_at, p_party_size, p_area,
        p_exclude_reservation_id
      ) c
      limit 1;

      if v_combo is not null and array_length(v_combo, 1) > 0 then
        v_ord := v_ord + 1;
        match_type    := 'alt_venue';
        ord           := v_ord;
        venue_id      := v_sibling.id;
        venue_name    := v_sibling.name;
        starts_at     := p_starts_at;
        ends_at       := v_ends_at;
        table_ids     := v_combo;
        combined      := true;
        capacity_min  := v_combo_cap_min;
        capacity_max  := v_combo_cap_max;
        return next;
      end if;
    end if;
  end loop;
end;
$$;

revoke execute on function public.find_availability_with_alternatives(
  bigint, timestamptz, integer, integer, bigint, text, integer, integer, bigint
) from public, authenticated;
grant  execute on function public.find_availability_with_alternatives(
  bigint, timestamptz, integer, integer, bigint, text, integer, integer, bigint
) to service_role;

commit;
