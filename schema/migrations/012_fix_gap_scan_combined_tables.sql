-- ============================================================================
-- Migration 012: Fix gap scan for parties requiring combined tables
-- ============================================================================
-- Root cause:
--   get_free_time_slots_for_venue filtered eligible_tables by
--   capacity_min <= party_size AND capacity_max >= party_size.
--   For a party of 5 at a venue with 2- and 4-person tables, no single table
--   satisfies this → eligible_tables is empty → function always returns nothing.
--
-- Fix:
--   The gap scan's job is to find WHEN tables are free, not whether a party
--   fits. Remove the party-size filter from the scan. The outer loop then
--   calls get_available_single_table_matches + find_best_table_combination
--   to confirm the party actually fits at each candidate slot.
-- ============================================================================

-- ─── Revised helper: scan booking gaps (no party-size filter) ────────────────

create or replace function public.get_free_time_slots_for_venue(
  p_venue_id     bigint,
  p_search_start timestamptz,
  p_search_end   timestamptz,
  p_duration     interval
)
returns table (
  slot_start timestamptz,
  slot_end   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_buf_before integer := 0;
  v_buf_after  integer := 0;
begin
  select
    coalesce(vs.booking_buffer_before_minutes, 0),
    coalesce(vs.booking_buffer_after_minutes, 0)
  into v_buf_before, v_buf_after
  from public.venue_settings vs
  where vs.venue_id = p_venue_id;

  return query
  with
  -- All active tables at this venue (no party-size filter — caller verifies fit)
  all_tables as (
    select t.id
    from public.tables t
    where t.venue_id = p_venue_id
      and t.is_active = true
  ),
  -- Existing bookings expanded by the venue's booking buffer
  bookings as (
    select
      rt.table_id,
      rt.starts_at - make_interval(mins => v_buf_before) as eff_start,
      rt.ends_at   + make_interval(mins => v_buf_after)  as eff_end
    from public.reservation_tables rt
    where rt.table_id in (select id from all_tables)
      and rt.released_at is null
      and rt.starts_at < p_search_end
      and rt.ends_at   > p_search_start
  ),
  -- Sentinel rows anchor the search window for every table.
  -- Left sentinel ends at p_search_start → gap can open from there.
  -- Right sentinel starts at p_search_end → gap closes there.
  all_intervals as (
    select table_id, eff_start, eff_end from bookings
    union all
    select id, p_search_start - p_duration, p_search_start from all_tables
    union all
    select id, p_search_end, p_search_end + p_duration from all_tables
  ),
  gaps as (
    select
      table_id,
      eff_end as gap_start,
      lead(eff_start) over (partition by table_id order by eff_start, eff_end) as gap_end
    from all_intervals
  ),
  valid_slots as (
    select distinct gap_start as slot_start
    from gaps
    where gap_end is not null
      and gap_start >= p_search_start
      and gap_start + p_duration <= p_search_end
      and gap_end   >= gap_start  + p_duration
  )
  select
    vs.slot_start,
    vs.slot_start + p_duration as slot_end
  from valid_slots vs
  order by vs.slot_start;
end;
$$;

-- Drop old 5-arg signature if it exists
drop function if exists public.get_free_time_slots_for_venue(bigint, integer, timestamptz, timestamptz, interval);
grant execute on function public.get_free_time_slots_for_venue(bigint, timestamptz, timestamptz, interval) to authenticated;


-- ─── Updated get_reallocation_options ────────────────────────────────────────

drop function if exists public.get_reallocation_options(bigint, integer, integer);

create or replace function public.get_reallocation_options(
  p_reservation_id    bigint,
  p_time_window_hours integer default 4,
  p_time_suggestions_each_side integer default 8  -- kept for signature compat
)
returns table (
  option_kind text,
  venue_id    bigint,
  venue_name  text,
  table_ids   bigint[],
  starts_at   timestamptz,
  ends_at     timestamptz,
  note        text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_res        public.reservations%rowtype;
  v_settings   public.venue_settings%rowtype;
  v_duration   interval;
  v_combo      bigint[];
  v_other      record;
  v_other_combo bigint[];

  -- alt-time loop
  v_slot         record;
  v_venue_name   text;
  v_alt_table_id bigint;
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then
    raise exception 'reservation not found';
  end if;

  v_duration := v_res.ends_at - v_res.starts_at;

  select v.name into v_venue_name
  from public.venues v
  where v.id = v_res.requested_venue_id;

  -- -------------------------------------------------------------------------
  -- Same venue, same time — single table
  -- -------------------------------------------------------------------------
  return query
  select
    'same_venue_same_time'::text,
    v.id, v.name,
    array[s.table_id]::bigint[],
    v_res.starts_at, v_res.ends_at,
    'Available single table at requested time'::text
  from public.venues v
  join public.get_available_single_table_matches(
    v_res.requested_venue_id, v_res.requested_table_type_id,
    v_res.starts_at, v_res.ends_at, v_res.party_size, null
  ) s on true
  where v.id = v_res.requested_venue_id;

  -- -------------------------------------------------------------------------
  -- Same venue, same time — combined tables
  -- -------------------------------------------------------------------------
  select c.table_ids into v_combo
  from public.find_best_table_combination(
    v_res.requested_venue_id, v_res.requested_table_type_id,
    v_res.starts_at, v_res.ends_at, v_res.party_size, null
  ) c
  limit 1;

  if v_combo is not null then
    return query
    select
      'same_venue_same_time_combined'::text,
      v.id, v.name, v_combo,
      v_res.starts_at, v_res.ends_at,
      'Available combined tables at requested time'::text
    from public.venues v
    where v.id = v_res.requested_venue_id;
  end if;

  -- -------------------------------------------------------------------------
  -- Load venue settings
  -- -------------------------------------------------------------------------
  select * into v_settings
  from public.venue_settings vs
  where vs.venue_id = v_res.requested_venue_id;

  -- -------------------------------------------------------------------------
  -- Same venue, alternative times — gap-scan then verify
  -- 1. get_free_time_slots_for_venue finds real free windows (any table free).
  -- 2. For each candidate slot: try single table first, fall back to combined.
  -- Not gated by allow_alternative_time_suggestions (support tool).
  -- -------------------------------------------------------------------------
  for v_slot in
    select ts.slot_start, ts.slot_end
    from public.get_free_time_slots_for_venue(
      v_res.requested_venue_id,
      v_res.starts_at - make_interval(hours => p_time_window_hours),
      v_res.ends_at   + make_interval(hours => p_time_window_hours),
      v_duration
    ) ts
    where not (ts.slot_start = v_res.starts_at and ts.slot_end = v_res.ends_at)
    order by ts.slot_start
  loop
    -- Try single table (null table type = any type)
    v_alt_table_id := null;
    select s.table_id into v_alt_table_id
    from public.get_available_single_table_matches(
      v_res.requested_venue_id, null,
      v_slot.slot_start, v_slot.slot_end,
      v_res.party_size, null
    ) s
    limit 1;

    if v_alt_table_id is not null then
      option_kind := 'same_venue_other_time';
      venue_id    := v_res.requested_venue_id;
      venue_name  := v_venue_name;
      table_ids   := array[v_alt_table_id];
      starts_at   := v_slot.slot_start;
      ends_at     := v_slot.slot_end;
      note        := format('Available at %s',
                      to_char(v_slot.slot_start at time zone 'UTC', 'HH24:MI'));
      return next;
    else
      -- Fall back to combined tables
      v_combo := null;
      select c.table_ids into v_combo
      from public.find_best_table_combination(
        v_res.requested_venue_id, null,
        v_slot.slot_start, v_slot.slot_end,
        v_res.party_size, null
      ) c
      limit 1;

      if v_combo is not null then
        option_kind := 'same_venue_other_time';
        venue_id    := v_res.requested_venue_id;
        venue_name  := v_venue_name;
        table_ids   := v_combo;
        starts_at   := v_slot.slot_start;
        ends_at     := v_slot.slot_end;
        note        := format('Combined tables – available at %s',
                        to_char(v_slot.slot_start at time zone 'UTC', 'HH24:MI'));
        return next;
      end if;
    end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- Group-member venues — always shown
  -- -------------------------------------------------------------------------
  return query
  select
    'group_venue_same_time'::text,
    v.id, v.name,
    array[s.table_id]::bigint[],
    v_res.starts_at, v_res.ends_at,
    format('Group venue (priority %s)', vgm.priority)::text
  from public.venues v
  join public.venue_settings gvs on gvs.venue_id = v.id
  join public.venue_group_members vgm on vgm.venue_id = v.id
  join public.venue_group_members origin_vgm
    on origin_vgm.venue_id = v_res.requested_venue_id
    and origin_vgm.group_id = vgm.group_id
  join public.get_available_single_table_matches(
    v.id, v_res.requested_table_type_id,
    v_res.starts_at, v_res.ends_at, v_res.party_size, null
  ) s on true
  where v.is_active = true
    and v.id <> v_res.requested_venue_id
    and gvs.booking_enabled = true
    and public.safe_is_within_venue_open_hours(v.id, v_res.starts_at, v_res.ends_at)
  order by vgm.priority asc;

  for v_other in
    select v.id, v.name, vgm.priority
    from public.venues v
    join public.venue_settings gvs on gvs.venue_id = v.id
    join public.venue_group_members vgm on vgm.venue_id = v.id
    join public.venue_group_members origin_vgm
      on origin_vgm.venue_id = v_res.requested_venue_id
      and origin_vgm.group_id = vgm.group_id
    where v.is_active = true
      and v.id <> v_res.requested_venue_id
      and gvs.booking_enabled = true
      and public.safe_is_within_venue_open_hours(v.id, v_res.starts_at, v_res.ends_at)
    order by vgm.priority asc
  loop
    select c.table_ids into v_other_combo
    from public.find_best_table_combination(
      v_other.id, v_res.requested_table_type_id,
      v_res.starts_at, v_res.ends_at, v_res.party_size, null
    ) c
    limit 1;

    if v_other_combo is not null then
      option_kind := 'group_venue_same_time_combined';
      venue_id    := v_other.id;
      venue_name  := v_other.name;
      table_ids   := v_other_combo;
      starts_at   := v_res.starts_at;
      ends_at     := v_res.ends_at;
      note        := format('Combined tables at group venue (priority %s)', v_other.priority);
      return next;
    end if;

    v_other_combo := null;
  end loop;

  -- -------------------------------------------------------------------------
  -- Non-group cross-venue — gated by allow_cross_venue_suggestions
  -- -------------------------------------------------------------------------
  if v_settings.allow_cross_venue_suggestions then

    return query
    select
      'other_venue_same_time'::text,
      v.id, v.name,
      array[s.table_id]::bigint[],
      v_res.starts_at, v_res.ends_at,
      'Alternative venue at same time'::text
    from public.venues v
    join public.venue_settings vs on vs.venue_id = v.id
    join public.get_available_single_table_matches(
      v.id, v_res.requested_table_type_id,
      v_res.starts_at, v_res.ends_at, v_res.party_size, null
    ) s on true
    where v.is_active = true
      and v.id <> v_res.requested_venue_id
      and vs.booking_enabled = true
      and public.safe_is_within_venue_open_hours(v.id, v_res.starts_at, v_res.ends_at)
      and not exists (
        select 1 from public.venue_group_members vgm2
        join public.venue_group_members origin_vgm2
          on origin_vgm2.venue_id = v_res.requested_venue_id
          and origin_vgm2.group_id = vgm2.group_id
        where vgm2.venue_id = v.id
      );

    for v_other in
      select v.id, v.name
      from public.venues v
      join public.venue_settings vs on vs.venue_id = v.id
      where v.is_active = true
        and v.id <> v_res.requested_venue_id
        and vs.booking_enabled = true
        and public.safe_is_within_venue_open_hours(v.id, v_res.starts_at, v_res.ends_at)
        and not exists (
          select 1 from public.venue_group_members vgm2
          join public.venue_group_members origin_vgm2
            on origin_vgm2.venue_id = v_res.requested_venue_id
            and origin_vgm2.group_id = vgm2.group_id
          where vgm2.venue_id = v.id
        )
    loop
      select c.table_ids into v_other_combo
      from public.find_best_table_combination(
        v_other.id, v_res.requested_table_type_id,
        v_res.starts_at, v_res.ends_at, v_res.party_size, null
      ) c
      limit 1;

      if v_other_combo is not null then
        option_kind := 'other_venue_same_time_combined';
        venue_id    := v_other.id;
        venue_name  := v_other.name;
        table_ids   := v_other_combo;
        starts_at   := v_res.starts_at;
        ends_at     := v_res.ends_at;
        note        := 'Combined tables at alternative venue';
        return next;
      end if;

      v_other_combo := null;
    end loop;

  end if;
end;
$$;

grant execute on function public.get_reallocation_options(bigint, integer, integer) to authenticated;
