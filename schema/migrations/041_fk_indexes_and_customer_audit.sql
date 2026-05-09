-- ============================================================================
-- Migration 041: missing FK indexes + customers.updated_at audit
-- ============================================================================
-- Two performance-and-integrity-of-audit improvements that landed during
-- the senior-level codebase audit:
--
-- 1. Two foreign keys lack supporting indexes.  Postgres doesn't auto-
--    create indexes on the *referencing* side of an FK; without them,
--    cascade deletes scan the whole table.
--
--      reservation_events.created_by → auth.users(id)
--      reservations.requested_table_type_id → table_types(id)
--
--    `created_by` is especially nasty because deleting a Supabase auth
--    user (rare but possible) does an unindexed sequential scan of
--    every reservation_event row.  Both indexes are partial — only
--    rows with non-NULL FKs need to be in the B-tree, keeping it small.
--
-- 2. `customers` has no `updated_at` column / trigger.  The
--    update_reservation_fields RPC writes to customer rows
--    (full_name/email/phone) but leaves no audit timestamp.  Add the
--    column with a default of created_at (so existing rows aren't all
--    "updated now") and wire a trigger to maintain it.
--
-- ── Safety notes ────────────────────────────────────────────────────
-- * Indexes use `IF NOT EXISTS` so re-running is idempotent.
-- * Index creation is non-CONCURRENT because both target tables have
--   bounded sizes in any sensible install; if you're adapting this for
--   a multi-million-row deployment, change to CREATE INDEX CONCURRENTLY
--   and run outside a transaction (which is why this whole migration
--   is wrapped in one — easier to roll back the column add than the
--   indexes).
-- * The `set_updated_at` trigger function already exists per
--   schema.sql; we reuse it.
-- ============================================================================

begin;

-- 1. FK indexes ─────────────────────────────────────────────────────────
create index if not exists idx_reservation_events_created_by
  on public.reservation_events (created_by)
  where created_by is not null;

create index if not exists idx_reservations_requested_table_type
  on public.reservations (requested_table_type_id)
  where requested_table_type_id is not null;

-- 2. customers.updated_at audit column ──────────────────────────────────
-- Two-step add so the backfill works correctly:
--   * `add column ... default null` — existing rows get NULL.
--   * `update ... set updated_at = created_at` — explicit backfill so
--     pre-migration rows show their actual creation time.
--   * `alter ... set not null` + `set default now()` — new rows from now
--     on default to NOW() and the trigger keeps it fresh.
--
-- The earlier "default now() then conditional UPDATE" approach was a
-- silent bug: ALTER TABLE evaluates `now()` once, all rows landed
-- with updated_at = <migration time>, and the WHERE clause matched
-- zero rows.  This shape is correct.
alter table public.customers
  add column if not exists updated_at timestamptz;

update public.customers
set updated_at = created_at
where updated_at is null;

alter table public.customers
  alter column updated_at set default now();
alter table public.customers
  alter column updated_at set not null;

-- Trigger keeps it fresh on every update.  `set_updated_at` lives in
-- schema.sql and is generic.
drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

commit;
