-- ============================================================================
-- Migration 038: find_availability_with_alternatives — fix venue-group join
-- ============================================================================
-- Migrations 031, 033, and 036 all defined `find_availability_with_alternatives`
-- with an alt-venue branch that joined siblings via a *non-existent* column:
--
--   join public.venues v on v.venue_group_id = vg.id   ← venues has no such col
--
-- The schema models venue↔group as a many-to-many relationship via
-- `public.venue_group_members(group_id, venue_id, priority)`.  The same
-- pattern was used correctly by migrations 011 and 012 (the older free-
-- time-slots gap scanner), so the trap was specific to the availability
-- checker.
--
-- Symptom: any time a row's "Most beférne" badge tries to suggest a
-- sibling venue, the function throws `column v.venue_group_id does not
-- exist` and the entire availability check 500s.  This is silently
-- masked by the route handler returning a generic 500, and the badge
-- just doesn't appear — staff lose the alt-venue suggestion completely.
--
-- Fix: replace the join with `venue_group_members vgm` and walk through
-- it to find both the origin's group(s) and the siblings.  Per migration
-- 007 a venue can be in multiple groups; we iterate distinct groups and
-- emit each sibling once (DISTINCT v.id).
--
-- ── Safety notes ────────────────────────────────────────────────────
-- * `CREATE OR REPLACE` keeps the same OID so existing GRANTs survive.
--   We re-grant explicitly anyway in case the signature ever drifts.
-- * Wrap in a transaction so a partial create doesn't leave the DB
--   in a half-defined state if something downstream fails.
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
  v_ord            integer := 0;
begin
  v_ends_at := p_starts_at + make_interval(mins => p_duration_minutes);

  -- ── REQUESTED slot, single ───────────────────────────────────────────
  if public.safe_is_within_venue_open_hours(p_venue_id, p_starts_at, v_ends_at) then
    select
      p_venue_id, (select v.name from public.venues v where v.id = p_venue_id),
      p_starts_at, v_ends_at,
      array[s.table_id]::bigint[], false,
      s.capacity_min::integer, s.capacity_max::integer
      into venue_id, venue_name, starts_at, ends_at,
           table_ids, combined, capacity_min, capacity_max
    from public.get_available_single_table_matches(
      p_venue_id, p_table_type_id, p_starts_at, v_ends_at, p_party_size, p_area,
      p_exclude_reservation_id
    ) s
    order by s.capacity_max asc
    limit 1;

    if found then
      v_ord := v_ord + 1;
      match_type := 'requested_single';
      ord        := v_ord;
      return next;
    else
      -- Try a combined option at the requested slot
      select c.table_ids, c.total_capacity, c.total_capacity
        into v_combo, v_combo_cap_min, v_combo_cap_max
      from public.find_best_table_combination(
        p_venue_id, p_table_type_id, p_starts_at, v_ends_at, p_party_size, p_area,
        p_exclude_reservation_id
      ) c
      limit 1;

      if v_combo is not null and array_length(v_combo, 1) > 0 then
        v_ord := v_ord + 1;
        match_type    := 'requested_combined';
        ord           := v_ord;
        venue_id      := p_venue_id;
        venue_name    := (select v.name from public.venues v where v.id = p_venue_id);
        starts_at     := p_starts_at;
        ends_at       := v_ends_at;
        table_ids     := v_combo;
        combined      := true;
        capacity_min  := v_combo_cap_min;
        capacity_max  := v_combo_cap_max;
        return next;
      end if;
    end if;
  end if;

  -- ── ALT TIMES at same venue ──────────────────────────────────────────
  -- Step outward in alternating ±step intervals, up to p_alt_time_window_minutes.
  v_step_offset := p_alt_time_step_minutes;
  while v_step_offset <= p_alt_time_window_minutes loop
    foreach v_alt_starts in array array[
      p_starts_at + make_interval(mins => v_step_offset),
      p_starts_at - make_interval(mins => v_step_offset)
    ] loop
      v_alt_ends := v_alt_starts + make_interval(mins => p_duration_minutes);
      if not public.safe_is_within_venue_open_hours(p_venue_id, v_alt_starts, v_alt_ends) then
        continue;
      end if;

      select
        p_venue_id, (select v.name from public.venues v where v.id = p_venue_id),
        v_alt_starts, v_alt_ends,
        array[s.table_id]::bigint[], false,
        s.capacity_min::integer, s.capacity_max::integer
        into venue_id, venue_name, starts_at, ends_at,
             table_ids, combined, capacity_min, capacity_max
      from public.get_available_single_table_matches(
        p_venue_id, p_table_type_id, v_alt_starts, v_alt_ends, p_party_size, p_area,
        p_exclude_reservation_id
      ) s
      order by s.capacity_max asc
      limit 1;

      if found then
        v_ord := v_ord + 1;
        match_type := 'alt_time';
        ord        := v_ord;
        return next;
        exit when v_ord >= 6;
      end if;
    end loop;

    v_step_offset := v_step_offset + p_alt_time_step_minutes;
    exit when v_ord >= 6;
  end loop;

  -- ── ALT VENUES (siblings via venue_group_members) at requested time ──
  -- Walk the M:N relation: groups the origin venue belongs to → other
  -- venues in those groups.  DISTINCT v.id so a venue in multiple
  -- shared groups isn't suggested twice.
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

-- Re-apply the security posture from migration 014 to the new body.
revoke execute on function public.find_availability_with_alternatives(
  bigint, timestamptz, integer, integer, bigint, text, integer, integer, bigint
) from public, authenticated;
grant  execute on function public.find_availability_with_alternatives(
  bigint, timestamptz, integer, integer, bigint, text, integer, integer, bigint
) to service_role;

commit;
