-- ============================================================================
-- Migration 027: batch_mark_reservations_completed
-- ============================================================================
-- The cron route was doing a raw UPDATE on reservations, which skipped two
-- things that mark_reservation_completed() handles:
--   - releasing reservation_tables rows (setting released_at = now())
--   - inserting a 'completed' audit event into reservation_events
--
-- This function does all three atomically in one round-trip via CTEs.
-- Only 'confirmed' reservations whose end time has passed are completed;
-- 'pending_manual_review' stays in the queue for manual intervention.
-- ============================================================================

create or replace function public.batch_mark_reservations_completed()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with completed as (
    update public.reservations
    set status = 'completed', completed_at = now()
    where status = 'confirmed'
      and ends_at < now()
    returning id
  ),
  _release as (
    update public.reservation_tables rt
    set released_at = now()
    from completed c
    where rt.reservation_id = c.id
      and rt.released_at is null
  ),
  _events as (
    insert into public.reservation_events (reservation_id, event_type)
    select id, 'completed' from completed
  )
  select count(*) into v_count from completed;

  return v_count;
end;
$$;

grant execute on function public.batch_mark_reservations_completed() to service_role;
