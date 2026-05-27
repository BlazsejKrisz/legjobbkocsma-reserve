-- ============================================================================
-- Migration 049: lock down SECURITY DEFINER RPC execution
-- ============================================================================
-- Supabase/PostgREST exposes every public function at /rest/v1/rpc/<name>.
-- All 49 SECURITY DEFINER functions were EXECUTE-able by the `anon` role,
-- meaning anyone holding the (browser-exposed, public) publishable/anon key
-- could call privileged RPCs directly — bypassing RLS, the app's auth checks,
-- rate limiting, honeypot and origin guards.
--
-- Most critically `assign_user_role` let an UNAUTHENTICATED caller grant
-- itself super_admin (full account/data takeover).  Others (create_reservation_auto,
-- get_or_create_customer, reassign_reservation, batch_mark_reservations_completed,
-- …) allowed direct data mutation outside the application layer.
--
-- Every one of these RPCs is invoked server-side through the service_role
-- client (createAdminClient) — none is called from the browser. So we revoke
-- EXECUTE from `anon` + PUBLIC on all of them, EXCEPT the boolean auth-check
-- predicates that RLS policies evaluate themselves (those must stay callable by
-- the querying role, otherwise RLS breaks).  service_role keeps EXECUTE.
--
-- Trigger functions (handle_new_user, trg_*) are unaffected in practice:
-- Postgres fires triggers without checking the invoking role's EXECUTE grant.
-- ============================================================================

-- 1) Revoke anon + PUBLIC execute on every SECURITY DEFINER function except the
--    RLS predicate helpers.  Loop form so it also covers any future ones.
do $$
declare
  fn   regprocedure;
  keep text[] := array['can_access_venue', 'is_super_admin', 'is_support', 'has_role'];
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname <> all (keep)
  loop
    execute format('revoke execute on function %s from anon, public;', fn);
    execute format('grant  execute on function %s to service_role;', fn);
  end loop;
end$$;

-- 2) Privilege-mutating RPCs are super_admin-only and only ever called via the
--    service_role client, so no logged-in (authenticated) user needs them
--    either — revoke there too so a registered non-staff account cannot escalate.
do $$
declare
  fn   regprocedure;
  lock text[] := array['assign_user_role', 'assign_user_to_venue'];
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (lock)
  loop
    execute format('revoke execute on function %s from authenticated;', fn);
  end loop;
end$$;
