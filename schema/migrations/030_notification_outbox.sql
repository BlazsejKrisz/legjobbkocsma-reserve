-- ============================================================================
-- Migration 030: notification_outbox
-- ============================================================================
-- Unified outbox for guest-facing notifications (email + SMS).
--
-- Why an outbox:
--   1. Decouples reservation creation from provider availability.  If Resend
--      or SeeMe is slow/down, the booking still succeeds — the message is
--      retried by the cron.
--   2. Audit trail.  Every send attempt is a row, queryable from the
--      observability dashboard.
--   3. Idempotency.  The outbox row id is passed to providers as a stable
--      identifier so retries don't double-send.
--   4. Rate-limit safety.  Drain rate is controlled by us, not by request
--      pattern bursts.
--
-- Send pipeline:
--   • POST /api/reservations          → enqueue row (status='pending')
--   • Same request: after() callback  → drainOne(rowId) → provider
--   • Cron every 1 min                → SELECT … FOR UPDATE SKIP LOCKED
--                                       drains anything that 'after()' missed
-- ============================================================================

create type public.notification_channel as enum ('email', 'sms');

create type public.notification_kind as enum (
  'confirmation',   -- "your reservation is confirmed"
  'received',       -- "we got your request, support will get back to you"
  'updated',        -- "your reservation has been updated" (overflow reassign)
  'reminder',       -- T-24h reminder (chunk 4)
  'cancellation'    -- "your reservation has been cancelled" (chunk 4)
);

create type public.notification_status as enum (
  'pending',        -- enqueued, not yet attempted
  'sending',        -- locked by a worker, in flight
  'sent',           -- provider returned success
  'failed',         -- provider returned a transient error, will retry
  'dead'            -- max attempts reached or fatal config error, won't retry
);

create table public.notification_outbox (
  id                bigserial primary key,
  reservation_id    bigint references public.reservations(id) on delete cascade,
  channel           public.notification_channel not null,
  kind              public.notification_kind not null,
  to_address        text not null,                -- email or E.164 phone (with +)
  payload           jsonb not null,               -- everything templates need to render
  status            public.notification_status not null default 'pending',
  attempts          int  not null default 0,
  provider_id       text,                         -- Resend message id / SeeMe reference
  last_error        text,
  next_attempt_at   timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  sent_at           timestamptz
);

-- Drain query: WHERE status in ('pending','failed') AND next_attempt_at <= now()
-- Partial index keeps this fast as the 'sent' archive grows unbounded.
create index idx_notification_outbox_drain
  on public.notification_outbox (next_attempt_at)
  where status in ('pending', 'failed');

-- For "show me everything that happened to reservation N"
create index idx_notification_outbox_reservation
  on public.notification_outbox (reservation_id);

-- For the dashboard timeline view (newest first)
create index idx_notification_outbox_created
  on public.notification_outbox (created_at desc);

-- Per-reservation channel preference, locked at create time.
-- Future: reminder / cancellation cron uses this to pick the channel without
-- recomputing from email/phone presence.
alter table public.reservations
  add column if not exists notification_channel public.notification_channel,
  add column if not exists reminder_sent_at timestamptz;

-- RLS: only super_admin / support can read the outbox.  Nothing in the app
-- needs venue_staff to see message contents (which include guest contact info
-- across venues).  Service role bypasses everything.
alter table public.notification_outbox enable row level security;

create policy notification_outbox_elevated_read on public.notification_outbox
  for select using (
    (select public.is_super_admin(auth.uid()))
    or (select public.is_support(auth.uid()))
  );
