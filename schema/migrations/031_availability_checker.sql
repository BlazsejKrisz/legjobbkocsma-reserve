-- ============================================================================
-- Migration 031: Availability checker RPCs
-- ============================================================================
-- For the support / phone-booking workflow:
--
-- 1. find_availability_with_alternatives()
--    Single round-trip that returns:
--      • Requested-slot matches (all singles + combo)
--      • If empty: alt time slots at same venue (±N min in M-min steps)
--      • If empty: same time at sibling venues in the same venue group
--    Result rows are sorted: requested first, then alt by closeness.
--
-- 2. create_reservation_pinned()
--    Creates a reservation with explicit, staff-chosen tables — skips
--    auto-assignment.  Used after support has visually picked an option in
--    the availability checker UI.
-- ============================================================================

-- ─── 1. find_availability_with_alternatives ──────────────────────────────────

create or replace function public.find_availability_with_alternatives(
  p_venue_id                  bigint,
  p_starts_at                 timestamptz,
  p_duration_minutes          integer,
  p_party_size                integer,
  p_table_type_id             bigint  default null,
  p_area                      text    default null,
  p_alt_time_window_minutes   integer default 180,
  p_alt_time_step_minutes     integer default 30
)
returns table (
  match_type        text,          -- 'requested' | 'alt_time' | 'alt_venue'
  ord               integer,       -- rendering order
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

  -- ── REQUESTED slot: single tables ────────────────────────────────────────
  for venue_id, venue_name, starts_at, ends_at, table_ids, combined,
      capacity_min, capacity_max in
    select
      p_venue_id,
      v.name,
      p_starts_at,
      v_ends_at,
      array[s.table_id]::bigint[],
      false,
      s.capacity_min::integer,
      s.capacity_max::integer
    from public.venues v
    cross join public.get_available_single_table_matches(
      p_venue_id, p_table_type_id, p_starts_at, v_ends_at, p_party_size, p_area
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

  -- ── REQUESTED slot: combination (if no singles or to add as option) ──────
  -- find_best_table_combination returns total_capacity (sum of seats) — for
  -- combos we report that as both min and max since "the combination seats N"
  -- is the only useful number; per-component min/max isn't meaningful.
  select c.table_ids, c.total_capacity, c.total_capacity
    into v_combo, v_combo_cap_min, v_combo_cap_max
  from public.find_best_table_combination(
    p_venue_id, p_table_type_id, p_starts_at, v_ends_at, p_party_size, p_area
  ) c
  limit 1;

  if v_combo is not null and array_length(v_combo, 1) > 1 then
    -- Don't dedupe: combo is meaningfully different from a single table
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

  v_found_any := v_ord > 0;

  -- If we found anything for the requested slot, don't bother with alts.
  if v_found_any then
    return;
  end if;

  -- ── ALT TIMES at same venue ──────────────────────────────────────────────
  -- Scan in steps from -window to +window, skipping the exact requested time.
  -- For each candidate slot, return at most ONE best option (single first,
  -- then combo).  Capped at ~6 results to keep the UI scannable.
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

    -- Try a single table first
    select
      p_venue_id, v.name, v_alt_starts, v_alt_ends,
      array[s.table_id]::bigint[], false,
      s.capacity_min::integer, s.capacity_max::integer
      into venue_id, venue_name, starts_at, ends_at,
           table_ids, combined, capacity_min, capacity_max
    from public.venues v
    cross join public.get_available_single_table_matches(
      p_venue_id, p_table_type_id, v_alt_starts, v_alt_ends, p_party_size, p_area
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
      -- Try a combination as fallback
      select c.table_ids, c.total_capacity, c.total_capacity
        into v_combo, v_combo_cap_min, v_combo_cap_max
      from public.find_best_table_combination(
        p_venue_id, p_table_type_id, v_alt_starts, v_alt_ends, p_party_size, p_area
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

    -- Stop after finding 6 alt-time options
    exit when v_ord >= 6;
  end loop;

  -- ── ALT VENUES (siblings in the same venue_group) at requested time ──────
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
      -- Try single
      select
        v_sibling.id, v_sibling.name, p_starts_at, v_ends_at,
        array[s.table_id]::bigint[], false,
        s.capacity_min::integer, s.capacity_max::integer
        into venue_id, venue_name, starts_at, ends_at,
             table_ids, combined, capacity_min, capacity_max
      from public.get_available_single_table_matches(
        v_sibling.id, p_table_type_id, p_starts_at, v_ends_at, p_party_size, p_area
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
          v_sibling.id, p_table_type_id, p_starts_at, v_ends_at, p_party_size, p_area
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

grant execute on function public.find_availability_with_alternatives(
  bigint, timestamptz, integer, integer, bigint, text, integer, integer
) to authenticated, service_role;


-- ─── 2. create_reservation_pinned ────────────────────────────────────────────
-- Creates a reservation with explicit tables — bypass auto-assignment.
-- Used by the availability checker after support visually picks tables.

create or replace function public.create_reservation_pinned(
  p_venue_id                  bigint,
  p_customer_id               bigint,
  p_source                    public.reservation_source,
  p_table_ids                 bigint[],
  p_starts_at                 timestamptz,
  p_duration_minutes          integer,
  p_party_size                integer,
  p_special_requests          text default null,
  p_internal_notes            text default null,
  p_requested_table_type_id   bigint default null
)
returns table (
  reservation_id    bigint,
  status            public.reservation_status,
  assigned_venue_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ends_at  timestamptz;
  v_res_id   bigint;
  v_table_id bigint;
begin
  perform pg_advisory_xact_lock(p_venue_id);

  if p_table_ids is null or array_length(p_table_ids, 1) is null then
    raise exception 'no tables provided';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_minutes);

  -- Verify all tables belong to the target venue
  if exists (
    select 1 from public.tables t
    where t.id = any(p_table_ids) and t.venue_id <> p_venue_id
  ) then
    raise exception 'one or more tables do not belong to venue %', p_venue_id;
  end if;

  -- Verify all tables are still free in the requested window.  GiST
  -- exclusion constraint on reservation_tables would catch a conflict on
  -- insert, but we want a clean error message rather than a constraint
  -- violation.
  if exists (
    select 1
    from public.reservation_tables rt
    join public.reservations r on r.id = rt.reservation_id
    where rt.table_id = any(p_table_ids)
      and rt.released_at is null
      and r.status in ('confirmed', 'pending_manual_review')
      and tstzrange(rt.starts_at, rt.ends_at, '[)') &&
          tstzrange(p_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'one or more tables are no longer available for this slot';
  end if;

  insert into public.reservations (
    requested_venue_id, assigned_venue_id, customer_id, source, status,
    requested_table_type_id, starts_at, ends_at, party_size,
    special_requests, internal_notes
  )
  values (
    p_venue_id, p_venue_id, p_customer_id, p_source, 'confirmed',
    p_requested_table_type_id, p_starts_at, v_ends_at, p_party_size,
    p_special_requests, p_internal_notes
  )
  returning id into v_res_id;

  foreach v_table_id in array p_table_ids loop
    insert into public.reservation_tables (
      reservation_id, table_id, venue_id, starts_at, ends_at
    )
    values (v_res_id, v_table_id, p_venue_id, p_starts_at, v_ends_at);
  end loop;

  insert into public.reservation_events (reservation_id, event_type, new_value)
  values (
    v_res_id, 'auto_confirmed',
    jsonb_build_object(
      'assigned_venue_id', p_venue_id,
      'table_ids', to_jsonb(p_table_ids),
      'combined', array_length(p_table_ids, 1) > 1,
      'pinned', true
    )
  );

  reservation_id    := v_res_id;
  status            := 'confirmed';
  assigned_venue_id := p_venue_id;
  return next;
end;
$$;

grant execute on function public.create_reservation_pinned(
  bigint, bigint, public.reservation_source, bigint[], timestamptz,
  integer, integer, text, text, bigint
) to service_role;
