-- ============================================================================
-- Migration 033: exclude-reservation-id support in availability lookups
-- ============================================================================
-- The edit dialog runs an availability check before saving date/time/party
-- changes.  Without an exclusion mechanism, the existing reservation's own
-- tables show as occupied (they're booked at the OLD time, which often
-- overlaps with the NEW time).  Result: false negatives — staff see "no
-- match" even when the same tables would still fit at the new criteria.
--
-- This migration threads `p_exclude_reservation_id` through the four
-- functions involved.  Adding the parameter at the END with a default of
-- NULL keeps existing callers working (CREATE OR REPLACE accepts the new
-- signature without dropping).
-- ============================================================================

-- ─── 1. get_available_tables — base layer ────────────────────────────────────

create or replace function public.get_available_tables(
  p_venue_id bigint,
  p_table_type_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_party_size integer,
  p_area text default null,
  p_exclude_reservation_id bigint default null
)
returns table (
  table_id bigint,
  table_name text,
  sort_order integer,
  blend_group text,
  can_blend boolean,
  area text,
  capacity_min integer,
  capacity_max integer,
  is_free boolean,
  can_fit boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with settings as (
    select
      vs.booking_buffer_before_minutes,
      vs.booking_buffer_after_minutes
    from public.venue_settings vs
    where vs.venue_id = p_venue_id
  ),
  candidate_tables as (
    select
      t.id,
      t.name,
      t.sort_order,
      t.blend_group,
      t.can_blend,
      t.area,
      t.capacity_min,
      t.capacity_max
    from public.tables t
    where t.venue_id = p_venue_id
      and t.is_active = true
      and (p_table_type_id is null or t.table_type_id = p_table_type_id)
      and (p_area is null or t.area = p_area)
  )
  select
    ct.id,
    ct.name,
    ct.sort_order,
    ct.blend_group,
    ct.can_blend,
    ct.area,
    ct.capacity_min,
    ct.capacity_max,
    not exists (
      select 1
      from public.reservation_tables rt
      cross join settings s
      where rt.table_id = ct.id
        and rt.released_at is null
        -- Exclude the reservation we're checking for, if any.  Lets the
        -- edit-modal availability check see "would this still fit if my
        -- own current booking didn't exist?"
        and (p_exclude_reservation_id is null or rt.reservation_id <> p_exclude_reservation_id)
        and tstzrange(
          rt.starts_at - make_interval(mins => s.booking_buffer_before_minutes),
          rt.ends_at + make_interval(mins => s.booking_buffer_after_minutes),
          '[)'
        ) && tstzrange(p_starts_at, p_ends_at, '[)')
    ) as is_free,
    (ct.capacity_min <= p_party_size and ct.capacity_max >= p_party_size) as can_fit
  from candidate_tables ct
  order by ct.sort_order asc, ct.capacity_max asc, ct.name asc;
$$;


-- ─── 2. get_available_single_table_matches ───────────────────────────────────

create or replace function public.get_available_single_table_matches(
  p_venue_id bigint,
  p_table_type_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_party_size integer,
  p_area text default null,
  p_exclude_reservation_id bigint default null
)
returns table (
  table_id bigint,
  table_name text,
  sort_order integer,
  capacity_min integer,
  capacity_max integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.table_id,
    t.table_name,
    t.sort_order,
    t.capacity_min,
    t.capacity_max
  from public.get_available_tables(
    p_venue_id,
    p_table_type_id,
    p_starts_at,
    p_ends_at,
    p_party_size,
    p_area,
    p_exclude_reservation_id
  ) t
  where t.is_free = true
    and t.can_fit = true
  order by t.capacity_max asc, t.sort_order asc, t.table_name asc;
$$;


-- ─── 3. find_best_table_combination ──────────────────────────────────────────

create or replace function public.find_best_table_combination(
  p_venue_id bigint,
  p_table_type_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_party_size integer,
  p_area text default null,
  p_exclude_reservation_id bigint default null
)
returns table (
  table_ids bigint[],
  total_capacity integer,
  table_count integer,
  used_cross_group boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.venue_settings%rowtype;
begin
  select * into v_settings
  from public.venue_settings
  where venue_id = p_venue_id;

  if not found or not v_settings.allow_combining_tables then
    return;
  end if;

  -- Same-group contiguous runs. Gaps-and-islands on
  -- (rank_within_group_among_free - sort_order_rank).
  return query
  with free_tables as (
    select *
    from public.get_available_tables(
      p_venue_id,
      p_table_type_id,
      p_starts_at,
      p_ends_at,
      p_party_size,
      p_area,
      p_exclude_reservation_id
    )
    where is_free = true and can_blend = true and blend_group is not null
  ),
  ranked as (
    select
      ft.*,
      dense_rank() over (partition by ft.blend_group order by ft.sort_order) as grp_rank,
      row_number() over (partition by ft.blend_group order by ft.sort_order) as row_rank
    from free_tables ft
  ),
  runs as (
    select
      blend_group,
      (grp_rank - row_rank) as run_key,
      array_agg(table_id order by sort_order) as ids,
      sum(capacity_max)::integer as cap,
      count(*)::integer as cnt
    from ranked
    group by blend_group, (grp_rank - row_rank)
  )
  select
    r.ids,
    r.cap,
    r.cnt,
    false
  from runs r
  where r.cap >= p_party_size
  order by r.cap asc, r.cnt asc
  limit 1;

  if found then
    return;
  end if;

  -- Cross-group fallback when settings allow it: any combination of free
  -- blendable tables across blend_groups whose total capacity fits, picking
  -- the smallest combination.  Mirrors the existing schema/schema.sql
  -- behavior — we don't want this migration to silently drop cross-group
  -- support that downstream callers rely on.
  if v_settings.allow_cross_group_table_blending then
    return query
    with free_tables as (
      select *
      from public.get_available_tables(
        p_venue_id,
        p_table_type_id,
        p_starts_at,
        p_ends_at,
        p_party_size,
        p_area,
        p_exclude_reservation_id
      )
      where is_free = true and can_blend = true
    ),
    ordered as (
      select
        ft.*,
        row_number() over (order by ft.capacity_max desc, ft.sort_order asc) as rn
      from free_tables ft
    ),
    cumulative as (
      select
        rn,
        table_id,
        capacity_max,
        sum(capacity_max) over (order by rn) as cum_cap,
        array_agg(table_id) over (order by rn) as cum_ids,
        count(*) over (order by rn) as cum_cnt
      from ordered
    ),
    first_match as (
      select cum_ids, cum_cap, cum_cnt
      from cumulative
      where cum_cap >= p_party_size
      order by rn
      limit 1
    )
    select fm.cum_ids, fm.cum_cap::integer, fm.cum_cnt::integer, true
    from first_match fm;
  end if;
end;
$$;


-- ─── 4. find_availability_with_alternatives ──────────────────────────────────
-- Pass-through.  Same body as migration 031 plus the exclude param wired
-- into all internal calls.

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

  -- REQUESTED slot: single tables
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

  -- REQUESTED slot: combination
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

  v_found_any := v_ord > 0;
  if v_found_any then return; end if;

  -- ALT TIMES at same venue
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

  -- ALT VENUES (siblings in the same venue_group) at requested time
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

grant execute on function public.find_availability_with_alternatives(
  bigint, timestamptz, integer, integer, bigint, text, integer, integer, bigint
) to authenticated, service_role;
