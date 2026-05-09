-- ============================================================================
-- Migration 045: safe_is_within_venue_open_hours — narrow exception class
-- ============================================================================
-- The original wrapper (migration 008) catches `WHEN OTHERS` and returns
-- TRUE.  This was meant to handle the "missing weekday row" case, but in
-- practice it also swallows:
--
--   * disk failures
--   * deadlocks
--   * permission errors
--   * function-not-found errors (e.g. after a botched migration)
--
-- … and presents those as "venue is open" — which means a single broken
-- function call could let a reservation slip past every open-hours
-- check in the codebase.  This is exactly the failure mode where
-- silent permissiveness is dangerous.
--
-- Fix: catch only `no_data_found` (the actual missing-row case) and
-- `raise_exception` (the inner function uses RAISE for missing-row).
-- Other exceptions propagate up the stack so the route handler can
-- surface a real 500 instead of silently approving an illegal slot.
--
-- ── Safety notes ────────────────────────────────────────────────────
-- * Existing semantics for the missing-row case unchanged: still
--   returns TRUE, so venues without configured hours still appear as
--   candidates in support flows.
-- * If a future change to is_within_venue_open_hours starts raising a
--   different class for the missing case, this wrapper will surface
--   that — which is what we want; we'd want to update the wrapper.
-- ============================================================================

begin;

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
exception
  when no_data_found then
    -- Missing weekday row in venue_open_hours → treat as always-open
    -- so unconfigured venues still appear as manual-support candidates.
    return true;
  when raise_exception then
    -- The inner function uses `raise exception 'missing open hours…'`
    -- when no row exists for the weekday.  Match that explicit case;
    -- everything else (deadlock, disk, permission) escapes the catch.
    if SQLERRM ilike '%missing open hours%' or SQLERRM ilike '%open_hours%' then
      return true;
    end if;
    raise;
end;
$$;

revoke execute on function public.safe_is_within_venue_open_hours(bigint, timestamptz, timestamptz) from public;
grant  execute on function public.safe_is_within_venue_open_hours(bigint, timestamptz, timestamptz) to authenticated, service_role;

commit;
