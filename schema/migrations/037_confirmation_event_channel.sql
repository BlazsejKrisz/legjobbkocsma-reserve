-- ============================================================================
-- Migration 037: mark_confirmation_email_sent records the channel used
-- ============================================================================
-- The reservation event log was hard-coding the "confirmation email sent"
-- label even when the actual notification went out by SMS.  Reason:
-- mark_confirmation_email_sent inserted a 'confirmation_email_sent' event
-- with new_value = {mode: 'auto'|'manual'} — no channel field, so the UI
-- couldn't tell which medium was used.
--
-- Fix: add a `p_channel` argument that lands in new_value alongside the
-- mode.  Existing callers that omit it default to 'email' (matches old
-- behavior).  The event_type stays as 'confirmation_email_sent' for
-- backward-compat with old rows; the UI distinguishes channels by
-- reading new_value.channel.
--
-- ── Safety notes ────────────────────────────────────────────────────────
-- 1. The 2-arg signature gets dropped before the new 3-arg version is
--    created.  Both steps wrapped in a transaction so external callers
--    never observe a moment where the function is missing or ambiguous.
-- 2. CREATE OR REPLACE with a different parameter list creates a new
--    overload.  Without dropping the old, both versions would coexist
--    and any 2-arg call would error 42725 — same trap as migration 033
--    → 034.
-- 3. Postgres function GRANTs are tied to the exact signature.  The old
--    grant from migration 014 (service_role can execute) doesn't carry
--    over to the new 3-arg version, so we re-grant explicitly.
-- 4. No Postgres-side dependencies on this function (no triggers, views,
--    or other functions call it) — verified before drop.  Only the API
--    routes call it via supabase-js, and the API is updated to pass 3 args.
-- ============================================================================

begin;

drop function if exists public.mark_confirmation_email_sent(bigint, text);

create or replace function public.mark_confirmation_email_sent(
  p_reservation_id bigint,
  p_mode text,
  p_channel text default 'email'
)
returns table (
  reservation_id bigint,
  auto_confirmation_email_sent_at timestamptz,
  manual_confirmation_email_sent_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auto   timestamptz;
  v_manual timestamptz;
begin
  if p_mode not in ('auto', 'manual') then
    raise exception 'invalid mode';
  end if;

  if p_channel not in ('email', 'sms') then
    raise exception 'invalid channel';
  end if;

  if p_mode = 'auto' then
    update public.reservations
    set auto_confirmation_email_sent_at = now()
    where id = p_reservation_id;
  else
    update public.reservations
    set manual_confirmation_email_sent_at = now()
    where id = p_reservation_id;
  end if;

  if not found then
    raise exception 'reservation not found';
  end if;

  select r.auto_confirmation_email_sent_at, r.manual_confirmation_email_sent_at
    into v_auto, v_manual
  from public.reservations r where r.id = p_reservation_id;

  insert into public.reservation_events (reservation_id, event_type, new_value)
  values (
    p_reservation_id,
    'confirmation_email_sent',
    jsonb_build_object('mode', p_mode, 'channel', p_channel)
  );

  reservation_id := p_reservation_id;
  auto_confirmation_email_sent_at := v_auto;
  manual_confirmation_email_sent_at := v_manual;
  return next;
end;
$$;

-- Re-apply the security posture from migration 014 to the new signature.
-- Postgres function GRANTs don't carry across signature changes; without
-- this, the API routes (which connect as service_role) would still work
-- by virtue of the default PUBLIC grant, but the explicit revoke from
-- 014 keeps the surface tight.
revoke execute on function public.mark_confirmation_email_sent(bigint, text, text) from public, authenticated;
grant  execute on function public.mark_confirmation_email_sent(bigint, text, text) to service_role;

commit;
