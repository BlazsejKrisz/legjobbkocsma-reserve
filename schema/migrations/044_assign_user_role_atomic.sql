-- ============================================================================
-- Migration 044: assign_user_role atomic upsert
-- ============================================================================
-- Migration 017 made assign_user_role do `DELETE then INSERT`.  Two
-- concurrent calls for the same user can interleave such that the user
-- briefly has zero roles (between DELETE and INSERT of one call), and a
-- third call landing in that window may see no rows when checking
-- privileges — locking out a super_admin for a moment.
--
-- Worse: if INSERT fails after DELETE (FK violation, concurrent constraint
-- change), the user is left role-less indefinitely.
--
-- Fix: replace with a single statement that locks the user's row first
-- (or no row), then either updates the existing role or inserts a new
-- one.  Concurrent callers serialize on the row lock; no zero-role
-- window.
--
-- ── Schema note ─────────────────────────────────────────────────────
-- `user_roles(user_id, role)` has a unique constraint on the pair, but
-- not on user_id alone.  That permits multiple roles per user, which
-- the application doesn't use.  We don't change the constraint here
-- (might break other code paths), but we enforce one-role-per-user at
-- the function level by deleting any rows that *don't* match the new
-- role atomically.
-- ============================================================================

begin;

create or replace function public.assign_user_role(
  p_user_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Take an advisory lock keyed on user id so concurrent calls for the
  -- same user serialize without locking the whole table.  Released at
  -- transaction end.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 17));

  -- Insert the new role first.  If it already exists (unique on
  -- user_id+role), nothing happens.  If a different role exists for
  -- this user we delete it AFTER the insert succeeds — so the user
  -- always has at least one role row at any moment another transaction
  -- might observe.
  insert into public.user_roles (user_id, role)
  values (p_user_id, p_role)
  on conflict (user_id, role) do nothing;

  -- Drop any other role rows for this user, leaving exactly one.
  delete from public.user_roles
  where user_id = p_user_id
    and role <> p_role;
end;
$$;

revoke execute on function public.assign_user_role(uuid, public.app_role) from public, authenticated;
grant  execute on function public.assign_user_role(uuid, public.app_role) to service_role;

commit;
