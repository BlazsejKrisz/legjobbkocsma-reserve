-- ============================================================================
-- Migration 039: get_or_create_customer — race-safe upsert
-- ============================================================================
-- The original implementation does SELECT-then-INSERT.  Two concurrent
-- public bookings for the same customer email (e.g. a customer
-- double-clicking submit, or two reservations made within milliseconds
-- by the same family) both pass the SELECT (no row), then both attempt
-- the INSERT — the second one trips the partial unique index on
-- email_normalized (or phone_normalized) and bubbles up a 23505 to
-- the route handler, where it surfaces as a generic 409.
--
-- Fix: collapse the SELECT + INSERT into a single statement that is
-- safe under concurrency.  We can't use INSERT ... ON CONFLICT directly
-- because the unique constraints are *partial* (`WHERE email_normalized
-- IS NOT NULL`), and Postgres doesn't allow ON CONFLICT to target a
-- partial index without naming the predicate exactly.
--
-- Approach: take a transaction-scoped advisory lock keyed on the
-- normalized email/phone hash.  Concurrent calls for the same
-- email/phone serialize on the lock; the second caller sees the row
-- the first one inserted via the SELECT pass.  The lock is released
-- automatically at COMMIT.  Cost is one extra round-trip-free hash.
--
-- ── Safety notes ────────────────────────────────────────────────────
-- * Advisory lock is non-blocking for unrelated emails (different hash).
-- * `pg_advisory_xact_lock(text)` doesn't exist — we hash to bigint via
--   `hashtextextended` so the lock key fits the (int4, int4) signature.
-- * Returning `bigint` is unchanged; existing callers don't need updates.
-- ============================================================================

begin;

create or replace function public.get_or_create_customer(
  p_full_name text,
  p_email text,
  p_phone text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email_norm  text   := public.normalize_email(p_email);
  v_phone_norm  text   := public.normalize_phone(p_phone);
  v_lock_key    bigint;
  v_customer_id bigint;
begin
  if v_email_norm is null and v_phone_norm is null then
    raise exception 'customer requires email or phone';
  end if;

  -- Hash whatever identifier we have.  Two callers that share an email
  -- (or phone if no email) serialize on this lock; the rest run in
  -- parallel.  The seed (42) keeps us out of any future advisory-lock
  -- namespace clash inside other RPCs.
  v_lock_key := hashtextextended(
    coalesce(v_email_norm, v_phone_norm),
    42
  );
  perform pg_advisory_xact_lock(v_lock_key);

  -- After acquiring the lock, re-check.  If a concurrent caller already
  -- inserted the row, we'll see it here and return its id.
  if v_email_norm is not null then
    select id into v_customer_id
    from public.customers
    where email_normalized = v_email_norm
    limit 1;
    if found then
      return v_customer_id;
    end if;
  end if;

  if v_phone_norm is not null then
    select id into v_customer_id
    from public.customers
    where phone_normalized = v_phone_norm
    limit 1;
    if found then
      return v_customer_id;
    end if;
  end if;

  insert into public.customers (full_name, email, phone)
  values (p_full_name, p_email, p_phone)
  returning id into v_customer_id;

  return v_customer_id;
end;
$$;

revoke execute on function public.get_or_create_customer(text, text, text) from public, authenticated;
grant  execute on function public.get_or_create_customer(text, text, text) to service_role;

commit;
