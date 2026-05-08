-- ============================================================================
-- Migration 035: fix find_best_table_combination — smallest window
-- ============================================================================
-- TWO BUGS being fixed.
--
-- Bug A — gap detection broken
-- ----------------------------
-- The previous SQL used `dense_rank() - row_number()` to detect contiguous
-- runs of tables.  That difference is always 0 when sort_order values are
-- distinct (because dense_rank and row_number progress in lockstep for
-- unique values), so all free tables collapsed into ONE giant run — even
-- when occupied tables sat between them in physical sort_order.
--
-- The correct gaps-and-islands formula is `sort_order - row_number()`:
-- if 3 tables (sort_order 3, 4, 5) and 6 (sort_order 8) are free with a
-- gap at 6/7, the differences become 2, 2, 2, 4 → splits into [3,4,5]
-- and [8] correctly.
--
-- Bug B — returns whole run instead of smallest fitting window
-- ------------------------------------------------------------
-- Even with correct run detection, the previous code aggregated each run
-- into a single row with sum/array_agg over the FULL run, then picked the
-- smallest run by capacity.  When a single run was big enough for the
-- party, it returned ALL tables in the run — sometimes 70+ tables for a
-- party of 12.  The fix uses a sliding window within each run to find
-- the smallest contiguous sub-array whose total capacity meets the party
-- size, then picks the global smallest.
--
-- This migration drops the existing function and recreates it.  Drops
-- both the (without exclude) and (with exclude) variants if either exist.
-- ============================================================================

drop function if exists public.find_best_table_combination(
  bigint, bigint, timestamptz, timestamptz, integer, text
);
drop function if exists public.find_best_table_combination(
  bigint, bigint, timestamptz, timestamptz, integer, text, bigint
);

create or replace function public.find_best_table_combination(
  p_venue_id                  bigint,
  p_table_type_id             bigint,
  p_starts_at                 timestamptz,
  p_ends_at                   timestamptz,
  p_party_size                integer,
  p_area                      text default null,
  p_exclude_reservation_id    bigint default null
)
returns table (
  table_ids        bigint[],
  total_capacity   integer,
  table_count      integer,
  used_cross_group boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings        public.venue_settings%rowtype;

  -- Per-run buffer (built up during the loop, emptied at run boundaries)
  v_run_caps        integer[];
  v_run_ids         bigint[];
  v_prev_blend      text;
  v_prev_sort       integer;

  v_table           record;
  v_i               integer;
  v_j               integer;
  v_sum             integer;
  v_n               integer;

  -- Best result so far (across all runs)
  v_best_cnt        integer := null;
  v_best_cap        integer := null;
  v_best_ids        bigint[];
  v_best_cross      boolean := false;
begin
  select * into v_settings
  from public.venue_settings
  where venue_id = p_venue_id;

  if not found or not v_settings.allow_combining_tables then
    return;
  end if;

  -- ─── Phase 1: same-group contiguous runs ────────────────────────────────
  -- Walk free tables in (blend_group, sort_order) order.  A run breaks
  -- whenever blend_group changes or sort_order isn't strictly +1 from the
  -- previous row.  At each break, run the sliding window over the
  -- accumulated buffer to find the smallest sub-window meeting the party
  -- size.

  v_run_caps := array[]::integer[];
  v_run_ids  := array[]::bigint[];
  v_prev_blend := null;
  v_prev_sort  := null;

  for v_table in
    select t.table_id as id, t.capacity_max, t.sort_order, t.blend_group
    from public.get_available_tables(
      p_venue_id, p_table_type_id, p_starts_at, p_ends_at,
      p_party_size, p_area, p_exclude_reservation_id
    ) t
    where t.is_free = true
      and t.can_blend = true
      and t.blend_group is not null
    order by t.blend_group, t.sort_order
  loop
    -- Detect run break (different group or non-consecutive sort_order)
    if v_prev_blend is not null and (
         v_table.blend_group <> v_prev_blend
         or v_table.sort_order <> v_prev_sort + 1
       ) then
      -- Process the run we just finished
      v_n := coalesce(array_length(v_run_caps, 1), 0);
      for v_i in 1..v_n loop
        v_sum := 0;
        for v_j in v_i..v_n loop
          v_sum := v_sum + v_run_caps[v_j];
          if v_sum >= p_party_size then
            if v_best_cnt is null or (v_j - v_i + 1) < v_best_cnt
               or ((v_j - v_i + 1) = v_best_cnt and v_sum < v_best_cap) then
              v_best_cnt   := v_j - v_i + 1;
              v_best_cap   := v_sum;
              v_best_ids   := v_run_ids[v_i:v_j];
              v_best_cross := false;
            end if;
            exit;
          end if;
        end loop;
      end loop;
      -- Reset buffer for the next run
      v_run_caps := array[]::integer[];
      v_run_ids  := array[]::bigint[];
    end if;

    v_run_caps := array_append(v_run_caps, v_table.capacity_max);
    v_run_ids  := array_append(v_run_ids,  v_table.id);
    v_prev_blend := v_table.blend_group;
    v_prev_sort  := v_table.sort_order;
  end loop;

  -- Process the trailing run after the loop
  v_n := coalesce(array_length(v_run_caps, 1), 0);
  for v_i in 1..v_n loop
    v_sum := 0;
    for v_j in v_i..v_n loop
      v_sum := v_sum + v_run_caps[v_j];
      if v_sum >= p_party_size then
        if v_best_cnt is null or (v_j - v_i + 1) < v_best_cnt
           or ((v_j - v_i + 1) = v_best_cnt and v_sum < v_best_cap) then
          v_best_cnt   := v_j - v_i + 1;
          v_best_cap   := v_sum;
          v_best_ids   := v_run_ids[v_i:v_j];
          v_best_cross := false;
        end if;
        exit;
      end if;
    end loop;
  end loop;

  -- If same-group produced anything, return it.
  if v_best_cnt is not null then
    table_ids        := v_best_ids;
    total_capacity   := v_best_cap;
    table_count      := v_best_cnt;
    used_cross_group := v_best_cross;
    return next;
    return;
  end if;

  -- ─── Phase 2: cross-group fallback ──────────────────────────────────────
  -- Greedy: take largest free blendable tables first until cumulative
  -- capacity meets the party size.  Greedy gives the minimum table count
  -- when the goal is to reach a sum threshold.

  if not v_settings.allow_cross_group_table_blending then
    return;
  end if;

  v_run_caps := array[]::integer[];
  v_run_ids  := array[]::bigint[];

  for v_table in
    select t.table_id as id, t.capacity_max, t.sort_order
    from public.get_available_tables(
      p_venue_id, p_table_type_id, p_starts_at, p_ends_at,
      p_party_size, p_area, p_exclude_reservation_id
    ) t
    where t.is_free = true
      and t.can_blend = true
    order by t.capacity_max desc nulls last, t.sort_order asc
  loop
    v_run_caps := array_append(v_run_caps, v_table.capacity_max);
    v_run_ids  := array_append(v_run_ids,  v_table.id);
  end loop;

  v_n := coalesce(array_length(v_run_caps, 1), 0);
  v_sum := 0;
  for v_i in 1..v_n loop
    v_sum := v_sum + v_run_caps[v_i];
    if v_sum >= p_party_size then
      table_ids        := v_run_ids[1:v_i];
      total_capacity   := v_sum;
      table_count      := v_i;
      used_cross_group := true;
      return next;
      return;
    end if;
  end loop;
end;
$$;

grant execute on function public.find_best_table_combination(
  bigint, bigint, timestamptz, timestamptz, integer, text, bigint
) to service_role;
