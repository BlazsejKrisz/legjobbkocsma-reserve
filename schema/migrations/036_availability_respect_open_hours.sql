-- ============================================================================
-- Migration 036: find_availability_with_alternatives respects open hours
-- ============================================================================
-- The "Most beférne" badge on the overflow queue uses
-- find_availability_with_alternatives to detect whether an overflow row
-- could now fit at its requested slot.  The original implementation only
-- checked table capacity, so it lit up the badge even when the venue
-- wasn't actually open at that time — leading to a false signal where
-- the reassignment dialog (which DOES check open hours) returns no
-- options, but the badge promised one.
--
-- Fix: skip any slot — requested, alt time, or alt venue — that isn't
-- within its venue's open hours.  Uses safe_is_within_venue_open_hours
-- so days without configured hours are silently treated as closed
-- (rather than throwing an exception).
-- ============================================================================

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
  v_group_id       bigint;
  v_sibling        record;
  v_found_any      boolean;
  v_ord            integer := 0;
begin
  v_ends_at := p_starts_at + make_interval(mins => p_duration_minutes);

  -- ── REQUESTED slot ─────────────────────────────────────────────────────
  -- Only return matches when the slot is within open hours.  If the venue
  -- is closed at this time, no badge / no match — keeps the support UI
  -- honest about what's actually bookable.
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
  -- aren't within the venue's open hours.
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

  -- ── ALT VENUES (siblings in the same venue_group) at requested time ───
  -- Each sibling's open hours are independent — check separately.
  select vg.id into v_group_id
  from public.venue_groups vg
  join public.venues v on v.venue_group_id = vg.id
  where v.id = p_venue_id
  limit 1;

  if v_group_id is not null then
    for v_sibling in
      select v.id, v.name
      from public.venues v
      where v.venue_group_id = v_group_id
        and v.id <> p_venue_id
        and v.is_active = true
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
  end if;
end;
$$;
