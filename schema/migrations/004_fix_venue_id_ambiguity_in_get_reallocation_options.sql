-- ============================================================================
-- Migration 004: Fix "column reference venue_id is ambiguous" (42702)
--                in get_reallocation_options
-- ============================================================================
-- The function's RETURNS TABLE declares `venue_id bigint` as an output column.
-- PL/pgSQL creates a variable with that name, so inside the body the bare
-- identifier `venue_id` is ambiguous between the output variable and the
-- `venue_settings.venue_id` table column.
--
-- Fix: alias the venue_settings table and use the qualified `vs.venue_id`.
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
  v_res public.reservations%rowtype;
  v_settings public.venue_settings%rowtype;
  v_duration interval;
  v_offset integer;
  v_combo bigint[];
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then
    raise exception 'reservation not found';
  end if;

  v_duration := v_res.ends_at - v_res.starts_at;

  -- same venue, same time, single-table
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

  -- same venue, same time, blended
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

  -- Qualify with table alias to avoid ambiguity with the `venue_id` output column.
  select * into v_settings
  from public.venue_settings vs
  where vs.venue_id = v_res.requested_venue_id;

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
      and public.is_within_venue_open_hours(v.id, v_res.starts_at, v_res.ends_at);
  end if;
end;
$$;

-- Re-grant execute (same signature — existing grant survives, but be explicit)
grant execute on function public.get_reallocation_options(bigint, integer, integer) to authenticated;
