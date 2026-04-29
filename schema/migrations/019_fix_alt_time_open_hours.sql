-- Fix: get_reallocation_options was showing invalid slots in two ways:
-- 1. same_venue_same_time / combined never checked open hours — an outside-hours
--    booking would show the same outside-hours slot as a "suggested option".
-- 2. same_venue_other_time (alt-time loop) scanned outside open hours too.
-- Fix: add is_within_venue_open_hours to ALL same-venue option sections, and
--      sort alt-time results by proximity to the original start time.

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
  -- Sorted by proximity to the original start time (closest first).
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
      and public.is_within_venue_open_hours(v_res.requested_venue_id, ts.slot_start, ts.slot_end)
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
