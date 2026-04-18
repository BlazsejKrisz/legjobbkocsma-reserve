-- ============================================================================
-- Migration 011: Gap-scan approach for alternative time suggestions
-- ============================================================================
-- Instead of checking ±N fixed offsets (which misses real gaps and fires N
-- separate availability queries), this migration:
--
--   1. Adds get_free_time_slots_for_venue — scans actual booking gaps using
--      LEAD() window function. One query per call finds every available slot
--      in a time window for any table that fits the party size.
--
--   2. Rewrites the same-venue-alt-time section in get_reallocation_options
--      to use this function, returning real available starts rather than
--      sampled offsets.
-- ============================================================================

-- ─── Helper: scan booking gaps ───────────────────────────────────────────────

create or replace function public.get_free_time_slots_for_venue(
  p_venue_id     bigint,
  p_party_size   integer,
  p_search_start timestamptz,
  p_search_end   timestamptz,
  p_duration     interval
)
returns table (
  slot_start timestamptz,
  slot_end   timestamptz,
  table_id   bigint,
  table_name text
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
  -- Tables that can seat the party on their own
  eligible_tables as (
    select t.id, t.name
    from public.tables t
    where t.venue_id = p_venue_id
      and t.is_active = true
      and t.capacity_min <= p_party_size
      and t.capacity_max >= p_party_size
  ),
  -- Existing bookings expanded by the venue's booking buffer
  bookings as (
    select
      rt.table_id,
      rt.starts_at - make_interval(mins => v_buf_before) as eff_start,
      rt.ends_at   + make_interval(mins => v_buf_after)  as eff_end
    from public.reservation_tables rt
    where rt.table_id in (select id from eligible_tables)
      and rt.released_at is null
      and rt.starts_at < p_search_end
      and rt.ends_at   > p_search_start
  ),
  -- Sentinel rows anchor the search window boundaries for each eligible table.
  -- A sentinel that "ends" at p_search_start creates a gap from p_search_start
  -- onward. A sentinel that "starts" at p_search_end closes the last gap.
  all_intervals as (
    select table_id, eff_start, eff_end from bookings
    union all
    -- left sentinel: gap can start from p_search_start
    select id, p_search_start - p_duration, p_search_start from eligible_tables
    union all
    -- right sentinel: gap ends at p_search_end
    select id, p_search_end, p_search_end + p_duration from eligible_tables
  ),
  -- For every interval, the gap starts where it ends and closes at the next
  -- interval's start (LEAD over the table's sorted timeline).
  gaps as (
    select
      table_id,
      eff_end as gap_start,
      lead(eff_start) over (partition by table_id order by eff_start, eff_end) as gap_end
    from all_intervals
  ),
  valid_slots as (
    select
      table_id,
      gap_start as slot_start
    from gaps
    where gap_end is not null
      and gap_start >= p_search_start
      and gap_start + p_duration <= p_search_end  -- slot fits before window closes
      and gap_end   >= gap_start  + p_duration    -- gap is wide enough
  )
  select
    vs.slot_start,
    vs.slot_start + p_duration as slot_end,
    et.id   as table_id,
    et.name as table_name
  from valid_slots vs
  join eligible_tables et on et.id = vs.table_id
  order by vs.slot_start, et.name;
end;
$$;

grant execute on function public.get_free_time_slots_for_venue(bigint, integer, timestamptz, timestamptz, interval) to authenticated;


-- ─── Updated get_reallocation_options ────────────────────────────────────────

create or replace function public.get_reallocation_options(
  p_reservation_id             bigint,
  p_time_window_hours          integer default 4,   -- search ± this many hours for alt times
  p_time_suggestions_each_side integer default 8    -- kept for signature compat, unused
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
  v_res      public.reservations%rowtype;
  v_settings public.venue_settings%rowtype;
  v_duration interval;
  v_combo    bigint[];

  v_other       record;
  v_other_combo bigint[];
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then
    raise exception 'reservation not found';
  end if;

  v_duration := v_res.ends_at - v_res.starts_at;

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
  -- Load original venue settings
  -- -------------------------------------------------------------------------
  select * into v_settings
  from public.venue_settings vs
  where vs.venue_id = v_res.requested_venue_id;

  -- -------------------------------------------------------------------------
  -- Same venue, alternative times — gap scan
  -- Finds every real free slot in a ±p_time_window_hours window.
  -- Not gated by allow_alternative_time_suggestions (support tool).
  -- Excludes the exact requested slot (already covered above).
  -- -------------------------------------------------------------------------
  return query
  select
    'same_venue_other_time'::text,
    v.id, v.name,
    array[ts.table_id]::bigint[],
    ts.slot_start,
    ts.slot_end,
    format('Available at %s',
      to_char(ts.slot_start at time zone 'UTC', 'HH24:MI'))::text
  from public.venues v
  join public.get_free_time_slots_for_venue(
    v_res.requested_venue_id,
    v_res.party_size,
    v_res.starts_at - make_interval(hours => p_time_window_hours),
    v_res.ends_at   + make_interval(hours => p_time_window_hours),
    v_duration
  ) ts on true
  where v.id = v_res.requested_venue_id
    -- exclude the exact requested slot (same_venue_same_time covers it)
    and not (ts.slot_start = v_res.starts_at and ts.slot_end = v_res.ends_at);

  -- -------------------------------------------------------------------------
  -- Group-member venues — always shown (bypasses allow_cross_venue_suggestions)
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
