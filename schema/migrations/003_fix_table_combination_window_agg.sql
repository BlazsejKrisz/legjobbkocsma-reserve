-- ============================================================================
-- Migration 003: Fix "aggregate ORDER BY is not implemented for window functions"
--                in find_best_table_combination
-- ============================================================================
-- PostgreSQL does not allow an ORDER BY clause inside an aggregate function
-- when that aggregate is used as a window function (OVER clause).
-- The ORDER BY in the OVER clause already controls the accumulation order,
-- so the ORDER BY inside array_agg() is both invalid and redundant.
--
-- Affected queries:
--   create_reservation_auto  (party > single-table capacity → tries to combine)
--   get_reallocation_options (reassign overflow → looks for combined tables)
-- ============================================================================

create or replace function public.find_best_table_combination(
  p_venue_id bigint,
  p_table_type_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_party_size integer,
  p_area text default null
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
  v_ids      bigint[];
  v_cap      integer;
begin
  select * into v_settings
  from public.venue_settings
  where venue_id = p_venue_id;

  if not found or not v_settings.allow_combining_tables then
    return;
  end if;

  -- Greedy minimum-tables selection:
  -- Sort free blendable tables by capacity ascending (smallest first so that
  -- large tables stay available for other bookings), then accumulate until the
  -- running total meets the party size.
  with free_tables as (
    select
      t.table_id,
      t.capacity_max,
      t.sort_order
    from public.get_available_tables(
      p_venue_id,
      p_table_type_id,
      p_starts_at,
      p_ends_at,
      p_party_size,
      p_area
    ) t
    where t.is_free = true
      and t.can_blend = true
  ),
  accumulated as (
    select
      -- ORDER BY must only appear in the OVER clause for window aggregates.
      -- The window ORDER BY already determines the accumulation order.
      array_agg(table_id)
        over (order by capacity_max asc, sort_order asc, table_id asc
              rows between unbounded preceding and current row) as ids,
      sum(capacity_max)
        over (order by capacity_max asc, sort_order asc, table_id asc
              rows between unbounded preceding and current row) as running_cap
    from free_tables
  )
  select ids, running_cap::integer
  into   v_ids, v_cap
  from   accumulated
  where  running_cap >= p_party_size
  order  by running_cap asc, array_length(ids, 1) asc
  limit  1;

  if v_ids is not null then
    table_ids      := v_ids;
    total_capacity := v_cap;
    table_count    := array_length(v_ids, 1);
    used_cross_group := false;
    return next;
  end if;
end;
$$;

-- Re-grant execute (same signature — existing grant survives, but be explicit)
grant execute on function public.find_best_table_combination(bigint, bigint, timestamptz, timestamptz, integer, text) to authenticated;
