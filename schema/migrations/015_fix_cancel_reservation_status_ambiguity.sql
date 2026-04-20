-- ============================================================================
-- Migration 015: Fix cancel_reservation status ambiguity
-- ============================================================================
-- `cancel_reservation` returns a column named `status`. The unqualified
-- `status` reference in the UPDATE WHERE clause is therefore ambiguous in
-- PL/pgSQL and can raise 42702 at runtime.

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
      when p_note is null then internal_notes
      when internal_notes is null then p_note
      else internal_notes || E'\n' || p_note
    end
  where r.id = p_reservation_id and r.status <> 'cancelled'
  returning r.cancelled_at into v_cancelled_at;

  if not found then
    raise exception 'reservation not found or already cancelled';
  end if;

  update public.reservation_tables rt
  set released_at = now()
  where rt.reservation_id = p_reservation_id and rt.released_at is null;

  insert into public.reservation_events (reservation_id, event_type, new_value)
  values (p_reservation_id, 'cancelled', jsonb_build_object('note', p_note));

  reservation_id := p_reservation_id;
  status := 'cancelled';
  cancelled_at := v_cancelled_at;
  return next;
end;
$$;
