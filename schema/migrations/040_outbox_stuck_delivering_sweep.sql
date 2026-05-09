-- ============================================================================
-- Migration 040: outbox stuck-`delivering` sweep
-- ============================================================================
-- `claim_outbox_batch` (integrations.sql) flips a row to status='delivering'
-- under SELECT ... FOR UPDATE SKIP LOCKED.  If the cron worker dies mid-
-- delivery — Vercel runtime kill, network partition, JS crash — the row
-- stays in 'delivering' forever because the drain query filters
-- status='pending' and no one re-claims it.
--
-- Symptom: an outbox row sits unsent.  Logs show no errors (the worker
-- never reported back).  The customer's email/SMS doesn't go out.
--
-- Fix: a sweep RPC that reverts any 'delivering' row whose last_attempt_at
-- is older than the timeout to 'pending'.  Run from the existing outbox
-- crons before the regular drain so the sweep + drain happen atomically
-- per tick.
--
-- This applies to BOTH outbox tables — the integration outbox
-- (integrations.sql) and the notification outbox (migration 030).  We
-- ship two parallel sweep functions because their column sets differ.
--
-- ── Safety notes ────────────────────────────────────────────────────
-- * Conservative timeout (5 min) — far longer than any real delivery
--   should take.  Stuck rows wait at most one cron tick beyond that.
-- * Returns the count of rows reverted so the cron can log it.
-- ============================================================================

begin;

-- ── Notification outbox ─────────────────────────────────────────────────
create or replace function public.sweep_stuck_notification_outbox()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Notification outbox uses status='sending' for in-flight rows.
  -- The table has no `updated_at` column; we use `next_attempt_at`
  -- as a coarse staleness signal — a worker that claimed a row
  -- moved next_attempt_at to "now" (or stale) before sending.  If
  -- the row is still 'sending' five minutes later the worker died.
  with reverted as (
    update public.notification_outbox
    set status = 'pending',
        last_error = coalesce(last_error || ' / ', '') || 'recovered from stuck-sending state',
        next_attempt_at = now()
    where status = 'sending'
      and next_attempt_at < now() - interval '5 minutes'
    returning id
  )
  select count(*)::integer into v_count from reverted;
  return v_count;
end;
$$;

revoke execute on function public.sweep_stuck_notification_outbox() from public, authenticated;
grant  execute on function public.sweep_stuck_notification_outbox() to service_role;

-- ── Integration outbox ──────────────────────────────────────────────────
create or replace function public.sweep_stuck_integration_outbox()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Integration outbox uses status='delivering'; revert when the last
  -- attempt is older than the safety window.
  with reverted as (
    update public.integration_outbox
    set status = 'pending',
        last_error = 'recovered from stuck-delivering state'
    where status = 'delivering'
      and last_attempt_at < now() - interval '5 minutes'
    returning id
  )
  select count(*)::integer into v_count from reverted;
  return v_count;
end;
$$;

revoke execute on function public.sweep_stuck_integration_outbox() from public, authenticated;
grant  execute on function public.sweep_stuck_integration_outbox() to service_role;

commit;
