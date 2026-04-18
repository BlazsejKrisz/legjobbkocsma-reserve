-- ============================================================================
-- Migration 006: Add combined-table suggestions for cross-venue reallocation
-- ============================================================================
-- The previous get_reallocation_options only called get_available_single_table_matches
-- for other venues, so if a party requires multiple tables at the alternative
-- venue, zero cross-venue options were returned.
--
-- This migration adds a loop over eligible other venues that also tries
-- find_best_table_combination, emitting 'other_venue_same_time_combined' rows.
-- ============================================================================

create or replace function public.get_reallocation_options(
  p_reservation_id bigint,
  p_time_step_minutes integer default 30,
  p_time_suggestions_each_side integer default 2
)
returns table (
  option_kind text,
  venue_id bigint,
  venue_name text,
  table_ids bigint[],
  starts_at timestamptz,
  ends_at timestamptz,
  note text
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

  -- for cross-venue combined loop
  v_other    record;
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
  -- Load original venue settings (controls alternative-time and cross-venue)
  -- -------------------------------------------------------------------------
  -- Qualify with table alias to avoid ambiguity with the `venue_id` output column.
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
          'Alternative time at requested venue'::text
        from public.venues v
        join public.get_available_single_table_matches(
          v_res.requested_venue_id, v_res.requested_table_type_id,
          v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes),
          (v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes)) + v_duration,
          v_res.party_size, null
        ) s on true
        where v.id = v_res.requested_venue_id
          and public.is_within_venue_open_hours(
            v_res.requested_venue_id,
            v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes),
            (v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes)) + v_duration
          );
      end if;
    end loop;
  end if;

  -- -------------------------------------------------------------------------
  -- Other venues — single table AND combined table suggestions
  -- -------------------------------------------------------------------------
  if v_settings.allow_cross_venue_suggestions then

    -- Single-table matches at other venues
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
      and public.is_within_venue_open_hours(v.id, v_res.starts_at, v_res.ends_at);

    -- Combined-table matches at other venues
    for v_other in
      select v.id, v.name
      from public.venues v
      join public.venue_settings vs on vs.venue_id = v.id
      where v.is_active = true
        and v.id <> v_res.requested_venue_id
        and vs.booking_enabled = true
        and public.is_within_venue_open_hours(v.id, v_res.starts_at, v_res.ends_at)
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
        note        := 'Available combined tables at alternative venue';
        return next;
      end if;

      v_other_combo := null; -- reset for next iteration
    end loop;

  end if;
end;
$$;

grant execute on function public.get_reallocation_options(bigint, integer, integer) to authenticated;
