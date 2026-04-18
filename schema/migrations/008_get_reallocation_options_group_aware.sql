-- ============================================================================
-- Migration 008: Make get_reallocation_options group-aware
-- ============================================================================
-- Problems fixed:
--
--   1. Group venues were still gated by allow_cross_venue_suggestions.
--      Group membership is an explicit opt-in — those venues must ALWAYS appear
--      in suggestions regardless of the flag.
--
--   2. is_within_venue_open_hours raises an exception when a weekday has no
--      configured hours, which bubbles up and silently kills the whole
--      RETURN QUERY, returning zero rows. Fixed by a safe wrapper that treats
--      missing open hours as "always open" (reasonable for support-level manual
--      review where a human is deciding anyway).
--
--   3. Group-member venues are now ordered by their priority (ascending), so the
--      highest-priority venue is offered first.
-- ============================================================================

-- ─── Safe open-hours wrapper ──────────────────────────────────────────────────
-- Returns TRUE when hours are not configured (missing row for that weekday),
-- so venues without a full hours setup still appear as candidates.

create or replace function public.safe_is_within_venue_open_hours(
  p_venue_id  bigint,
  p_starts_at timestamptz,
  p_ends_at   timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return public.is_within_venue_open_hours(p_venue_id, p_starts_at, p_ends_at);
exception when others then
  -- Missing open-hours row → treat as always-open for manual support use
  return true;
end;
$$;

grant execute on function public.safe_is_within_venue_open_hours(bigint, timestamptz, timestamptz) to authenticated;


-- ─── Updated get_reallocation_options ────────────────────────────────────────

create or replace function public.get_reallocation_options(
  p_reservation_id             bigint,
  p_time_step_minutes          integer default 30,
  p_time_suggestions_each_side integer default 2
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
  v_offset   integer;
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
  -- Same venue, alternative times
  -- -------------------------------------------------------------------------
  if v_settings.allow_alternative_time_suggestions then
    for v_offset in -p_time_suggestions_each_side .. p_time_suggestions_each_side loop
      if v_offset <> 0 then
        return query
        select
          'same_venue_other_time'::text,
          v.id, v.name,
          array[s.table_id]::bigint[],
          v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes),
          (v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes)) + v_duration,
          format('Alternative time at requested venue (%s%s min)',
            case when v_offset > 0 then '+' else '' end, v_offset * p_time_step_minutes)::text
        from public.venues v
        join public.get_available_single_table_matches(
          v_res.requested_venue_id, v_res.requested_table_type_id,
          v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes),
          (v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes)) + v_duration,
          v_res.party_size, null
        ) s on true
        where v.id = v_res.requested_venue_id
          and public.safe_is_within_venue_open_hours(
            v_res.requested_venue_id,
            v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes),
            (v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes)) + v_duration
          );
      end if;
    end loop;
  end if;

  -- -------------------------------------------------------------------------
  -- Group-member venues — always shown (bypasses allow_cross_venue_suggestions)
  -- ordered by group priority (ascending = highest priority first)
  -- -------------------------------------------------------------------------

  -- Single-table matches at group-member venues
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

  -- Combined-table matches at group-member venues (loop needed for find_best_table_combination)
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
  -- Non-group cross-venue suggestions — gated by allow_cross_venue_suggestions
  -- -------------------------------------------------------------------------
  if v_settings.allow_cross_venue_suggestions then

    -- Single-table matches at non-group venues
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
      -- exclude venues already shown via group membership
      and not exists (
        select 1 from public.venue_group_members vgm2
        join public.venue_group_members origin_vgm2
          on origin_vgm2.venue_id = v_res.requested_venue_id
          and origin_vgm2.group_id = vgm2.group_id
        where vgm2.venue_id = v.id
      );

    -- Combined-table matches at non-group venues
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
