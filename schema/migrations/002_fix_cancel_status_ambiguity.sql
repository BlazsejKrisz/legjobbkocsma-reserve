-- ============================================================================
-- Migration 002: Fix "column reference status is ambiguous" in cancel_reservation
-- ============================================================================
-- The function returns a table with a column named `status`, and the UPDATE
-- WHERE clause also references `status` (the reservations column). PostgreSQL
-- can't tell which is which. Fix: qualify with the table name.
-- Same issue exists in mark_reservation_completed and mark_reservation_no_show.
-- ============================================================================

create or replace function public.cancel_reservation(
  p_reservation_id bigint,
  p_note text default null
)
returns table (
  reservation_id bigint,
  status public.reservation_status,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cancelled_at timestamptz;
begin
  update public.reservations r
  set
    status = 'cancelled',
    cancelled_at = now(),
    internal_notes = case
      when p_note is null then r.internal_notes
      when r.internal_notes is null then p_note
      else r.internal_notes || E'\n' || p_note
    end
  where r.id = p_reservation_id
    and r.status <> 'cancelled';

  if not found then
    raise exception 'reservation not found or already cancelled';
  end if;

  update public.reservation_tables rt
  set released_at = now()
  where rt.reservation_id = p_reservation_id and rt.released_at is null;

  select r.cancelled_at into v_cancelled_at
  from public.reservations r where r.id = p_reservation_id;

  insert into public.reservation_events (reservation_id, event_type, new_value)
  values (p_reservation_id, 'cancelled', jsonb_build_object('note', p_note));

  reservation_id := p_reservation_id;
  status := 'cancelled';
  cancelled_at := v_cancelled_at;
  return next;
end;
$$;

create or replace function public.mark_reservation_completed(
  p_reservation_id bigint
)
returns table (
  reservation_id bigint,
  status public.reservation_status,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed_at timestamptz;
begin
  update public.reservations r
  set status = 'completed', completed_at = now()
  where r.id = p_reservation_id
    and r.status not in ('cancelled', 'completed');

  if not found then
    raise exception 'reservation not found or cannot be completed';
  end if;

  select r.completed_at into v_completed_at
  from public.reservations r where r.id = p_reservation_id;

  insert into public.reservation_events (reservation_id, event_type)
  values (p_reservation_id, 'completed');

  reservation_id := p_reservation_id;
  status := 'completed';
  completed_at := v_completed_at;
  return next;
end;
$$;

create or replace function public.mark_reservation_no_show(
  p_reservation_id bigint
)
returns table (
  reservation_id bigint,
  status public.reservation_status
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reservations r
  set status = 'no_show'
  where r.id = p_reservation_id
    and r.status not in ('cancelled', 'completed', 'no_show');

  if not found then
    raise exception 'reservation not found or cannot be marked no_show';
  end if;

  insert into public.reservation_events (reservation_id, event_type)
  values (p_reservation_id, 'no_show_marked');

  reservation_id := p_reservation_id;
  status := 'no_show';
  return next;
end;
$$;

grant execute on function public.cancel_reservation(bigint, text) to authenticated;
grant execute on function public.mark_reservation_completed(bigint) to authenticated;
grant execute on function public.mark_reservation_no_show(bigint) to authenticated;
