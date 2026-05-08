-- ============================================================================
-- Migration 024: Fix free-slot scan + safe open-hours in alt-time loop
-- ============================================================================
-- Two bugs fixed:
--
--   1. get_free_time_slots_for_venue (migration 012) used a gap-boundary
--      approach: "select distinct gap_start". This returns only the START of
--      each free gap, not every valid starting point within it. A table that
--      is free from 11:00-21:00 produced exactly ONE slot (11:00) instead of
--      ~16 (one every 30 min). Fix: generate_series across the search window
--      and check, per candidate slot, whether any table is free.
--
--   2. get_reallocation_options (migration 019) used is_within_venue_open_hours
--      (the throwing version) inside the alt-time FOR loop. If any candidate
--      slot's day has no configured open-hours row, the function throws and
--      kills the entire loop. Fix: replace with safe_is_within_venue_open_hours.
-- ============================================================================

-- ─── Revised helper ──────────────────────────────────────────────────────────

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
  all_tables as (
    select t.id
    from public.tables t
    where t.venue_id = p_venue_id
      and t.is_active = true
  ),
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
  -- Generate every 30-min candidate start within the search window
  candidates as (
    select gs as slot_start
    from generate_series(
      p_search_start,
      p_search_end - p_duration,
      '30 minutes'::interval
    ) gs
  ),
  -- A candidate is valid if at least one table is free for the full duration
  valid_slots as (
    select distinct c.slot_start
    from candidates c
    where exists (
      select 1 from all_tables at2
      where not exists (
        select 1 from bookings b
        where b.table_id = at2.id
          and b.eff_start < c.slot_start + p_duration
          and b.eff_end   > c.slot_start
      )
    )
  )
  select vs.slot_start, vs.slot_start + p_duration as slot_end
  from valid_slots vs
  order by vs.slot_start;
end;
$$;

grant execute on function public.get_free_time_slots_for_venue(bigint, timestamptz, timestamptz, interval) to authenticated;
grant execute on function public.get_free_time_slots_for_venue(bigint, timestamptz, timestamptz, interval) to service_role;


-- ─── Revised get_reallocation_options ────────────────────────────────────────

drop function if exists public.get_reallocation_options(bigint, integer, integer);

create or replace function public.get_reallocation_options(
  p_reservation_id    bigint,
  p_time_window_hours integer default 4,
  p_party_size_limit  integer default 500
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
  v_res         public.reservations%rowtype;
  v_settings    public.venue_settings%rowtype;
  v_duration    interval;
  v_combo       bigint[];
  v_other       record;
  v_other_combo bigint[];
  v_slot        record;
  v_venue_name  text;
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
  where v.id = v_res.requested_venue_id
    and public.safe_is_within_venue_open_hours(v_res.requested_venue_id, v_res.starts_at, v_res.ends_at);

  -- -------------------------------------------------------------------------
  -- Same venue, same time — combined tables
  -- -------------------------------------------------------------------------
  if public.safe_is_within_venue_open_hours(v_res.requested_venue_id, v_res.starts_at, v_res.ends_at) then
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
  end if;

  -- -------------------------------------------------------------------------
  -- Load venue settings
  -- -------------------------------------------------------------------------
  select * into v_settings
  from public.venue_settings vs
  where vs.venue_id = v_res.requested_venue_id;

  -- -------------------------------------------------------------------------
  -- Same venue, alternative times — gap-scan + open hours filter
  -- Uses safe_is_within_venue_open_hours to avoid exceptions for days without
  -- configured hours. Sorted by proximity to the original start time.
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
      and public.safe_is_within_venue_open_hours(v_res.requested_venue_id, ts.slot_start, ts.slot_end)
    order by abs(extract(epoch from (ts.slot_start - v_res.starts_at)))
  loop
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
grant execute on function public.get_reallocation_options(bigint, integer, integer) to service_role;
