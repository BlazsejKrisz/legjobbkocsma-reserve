-- ============================================================================
-- Migration 048: keep reservation_tables on completion (traceability)
-- ============================================================================
-- The cron job `batch_mark_reservations_completed` (migration 027) marks
-- finished reservations as 'completed' AND sets `released_at = now()` on
-- every `reservation_tables` row for those reservations.  The frontend
-- everywhere filters `released_at IS NULL`, so once a reservation
-- completes, all visual trace of which tables it occupied disappears.
--
-- For audit / customer history that's the wrong default: support staff
-- often need to know "which table did this guest sit at last time?"
-- to handle preferences, complaints, or repeat-booking workflows.
-- Single-row `mark_reservation_completed` (used by the manual "Mark
-- complete" button) already DOESN'T release tables, so the cron was
-- inconsistent with the manual path too.
--
-- Fix:
--   1. Modify the cron to skip the table-release step.  The
--      `reservations.status = 'completed'` flag plus `completed_at`
--      is enough to know the booking has ended; the table assignment
--      is preserved for history.
--   2. Retroactive backfill: for already-completed reservations whose
--      table rows were released at (or near) the completion timestamp,
--      restore `released_at = NULL`.  The 60-second window catches the
--      cron release without touching rows that were released earlier
--      by a tables-change action (those stay released because they
--      represent a real "table A was given up for table B" event).
--
-- ── Safety notes ────────────────────────────────────────────────────
-- * The GiST exclusion on `reservation_tables` is gated by
--   `WHERE released_at IS NULL`.  Keeping rows un-released after
--   completion means they STAY in the index.  Since completed
--   reservations have `ends_at < now()`, no future booking can
--   overlap (booking dates must be >= now() + min_notice), so the
--   exclusion doesn't fire.  Only edge case: admin overrides via
--   `create_reservation_pinned` for past slots would now see a
--   conflict — but that's a rare back-fill workflow and the friendly
--   error is the right outcome.
-- * The single-row `mark_reservation_completed` already preserves
--   tables; this brings the cron in line.
-- * Reverting cancellations (`revert_reservation_cancellation`) still
--   sets `released_at = NULL` for the row's tables, unchanged.
-- ============================================================================

begin;

-- ── 1. Cron: skip the release step ──────────────────────────────────────
create or replace function public.batch_mark_reservations_completed()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Update status + completed_at AND emit the audit event in one
  -- statement.  The `reservation_tables` rows stay untouched —
  -- their `released_at` was either set earlier by a tables-change
  -- action, or stays NULL so support can see what the guest used.
  with completed as (
    update public.reservations
    set status = 'completed', completed_at = now()
    where status = 'confirmed'
      and ends_at < now()
    returning id
  ),
  _events as (
    insert into public.reservation_events (reservation_id, event_type)
    select id, 'completed' from completed
  )
  select count(*) into v_count from completed;

  return v_count;
end;
$$;

revoke execute on function public.batch_mark_reservations_completed() from public, authenticated;
grant  execute on function public.batch_mark_reservations_completed() to service_role;

-- ── 2. Retroactive backfill ─────────────────────────────────────────────
-- Restore `released_at = NULL` on reservation_tables rows where:
--   * The parent reservation is completed (has completed_at)
--   * The row's released_at lands within 60 seconds of completed_at
--     — i.e. it was released BY the completion, not by an earlier
--     tables change.
--
-- The 60-second window is generous: even a slow cron tick that
-- bursts after a long pause won't drift outside it.  Tighter
-- (e.g. 5 seconds) would miss the edge case of a slow batch; looser
-- (e.g. 10 minutes) might catch unrelated changes — 60s strikes a
-- safe balance.
update public.reservation_tables rt
set released_at = null
from public.reservations r
where rt.reservation_id = r.id
  and r.status = 'completed'
  and r.completed_at is not null
  and rt.released_at is not null
  and rt.released_at between r.completed_at - interval '60 seconds'
                         and r.completed_at + interval '60 seconds';

commit;
