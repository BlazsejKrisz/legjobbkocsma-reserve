-- ============================================================================
-- Migration 028: RLS performance + missing FK index
-- ============================================================================
-- Two fixes guided by Supabase Postgres best practices:
--
-- 1. RLS policy caching (security-rls-performance)
--    All policies were calling auth.uid() / helper functions directly, which
--    Postgres evaluates once PER ROW.  Wrapping each call in (select ...)
--    causes Postgres to evaluate it once per query and cache the result.
--    Impact: 5-100x faster on tables with many rows.
--
--    Pattern: using (func(auth.uid()))
--    Fixed:   using ((select func(auth.uid())))
--
--    Postgres has no CREATE OR REPLACE POLICY, so each policy is dropped and
--    recreated.  Wrapped in a single transaction so RLS is never temporarily
--    disabled for any table.
--
-- 2. Missing FK index on reservation_tables(reservation_id)
--    The ON DELETE CASCADE FK existed but had no index, causing full table
--    scans on every per-reservation lookup (cancel, complete, reassign).
-- ============================================================================

begin;

-- ─── 1. user_profiles ────────────────────────────────────────────────────────

drop policy if exists user_profiles_self_read on public.user_profiles;
create policy user_profiles_self_read on public.user_profiles
  for select using ((select auth.uid()) = user_id);

drop policy if exists user_profiles_elevated_read on public.user_profiles;
create policy user_profiles_elevated_read on public.user_profiles
  for select using (
    (select public.is_super_admin(auth.uid()))
    or (select public.is_support(auth.uid()))
  );

drop policy if exists user_profiles_superadmin_write on public.user_profiles;
create policy user_profiles_superadmin_write on public.user_profiles
  for all
  using ((select public.is_super_admin(auth.uid())))
  with check ((select public.is_super_admin(auth.uid())));


-- ─── 2. user_roles ───────────────────────────────────────────────────────────

drop policy if exists user_roles_self_read on public.user_roles;
create policy user_roles_self_read on public.user_roles
  for select using ((select auth.uid()) = user_id);

drop policy if exists user_roles_elevated_read on public.user_roles;
create policy user_roles_elevated_read on public.user_roles
  for select using (
    (select public.is_super_admin(auth.uid()))
    or (select public.is_support(auth.uid()))
  );

drop policy if exists user_roles_superadmin_write on public.user_roles;
create policy user_roles_superadmin_write on public.user_roles
  for all
  using ((select public.is_super_admin(auth.uid())))
  with check ((select public.is_super_admin(auth.uid())));


-- ─── 3. venues ───────────────────────────────────────────────────────────────

drop policy if exists venues_read on public.venues;
create policy venues_read on public.venues
  for select using (
    (select public.is_super_admin(auth.uid()))
    or (select public.is_support(auth.uid()))
    or (select public.can_access_venue(auth.uid(), id))
  );

drop policy if exists venues_superadmin_write on public.venues;
create policy venues_superadmin_write on public.venues
  for all
  using ((select public.is_super_admin(auth.uid())))
  with check ((select public.is_super_admin(auth.uid())));


-- ─── 4. venue_settings ───────────────────────────────────────────────────────

drop policy if exists venue_settings_read on public.venue_settings;
create policy venue_settings_read on public.venue_settings
  for select using ((select public.can_access_venue(auth.uid(), venue_id)));

drop policy if exists venue_settings_superadmin_write on public.venue_settings;
create policy venue_settings_superadmin_write on public.venue_settings
  for all
  using ((select public.is_super_admin(auth.uid())))
  with check ((select public.is_super_admin(auth.uid())));


-- ─── 5. venue_open_hours ─────────────────────────────────────────────────────

drop policy if exists venue_open_hours_read on public.venue_open_hours;
create policy venue_open_hours_read on public.venue_open_hours
  for select using ((select public.can_access_venue(auth.uid(), venue_id)));

drop policy if exists venue_open_hours_superadmin_write on public.venue_open_hours;
create policy venue_open_hours_superadmin_write on public.venue_open_hours
  for all
  using ((select public.is_super_admin(auth.uid())))
  with check ((select public.is_super_admin(auth.uid())));


-- ─── 6. venue_integrations ───────────────────────────────────────────────────

drop policy if exists venue_integrations_read on public.venue_integrations;
create policy venue_integrations_read on public.venue_integrations
  for select using ((select public.can_access_venue(auth.uid(), venue_id)));

drop policy if exists venue_integrations_superadmin_write on public.venue_integrations;
create policy venue_integrations_superadmin_write on public.venue_integrations
  for all
  using ((select public.is_super_admin(auth.uid())))
  with check ((select public.is_super_admin(auth.uid())));


-- ─── 7. venue_user_assignments ───────────────────────────────────────────────

drop policy if exists vua_self_read on public.venue_user_assignments;
create policy vua_self_read on public.venue_user_assignments
  for select using ((select auth.uid()) = user_id);

drop policy if exists vua_elevated_read on public.venue_user_assignments;
create policy vua_elevated_read on public.venue_user_assignments
  for select using (
    (select public.is_super_admin(auth.uid()))
    or (select public.is_support(auth.uid()))
  );

drop policy if exists vua_superadmin_write on public.venue_user_assignments;
create policy vua_superadmin_write on public.venue_user_assignments
  for all
  using ((select public.is_super_admin(auth.uid())))
  with check ((select public.is_super_admin(auth.uid())));


-- ─── 8. table_types ──────────────────────────────────────────────────────────

drop policy if exists table_types_read on public.table_types;
create policy table_types_read on public.table_types
  for select using ((select auth.uid()) is not null);

drop policy if exists table_types_superadmin_write on public.table_types;
create policy table_types_superadmin_write on public.table_types
  for all
  using ((select public.is_super_admin(auth.uid())))
  with check ((select public.is_super_admin(auth.uid())));


-- ─── 9. tables ───────────────────────────────────────────────────────────────

drop policy if exists tables_read on public.tables;
create policy tables_read on public.tables
  for select using ((select public.can_access_venue(auth.uid(), venue_id)));

drop policy if exists tables_superadmin_write on public.tables;
create policy tables_superadmin_write on public.tables
  for all
  using ((select public.is_super_admin(auth.uid())))
  with check ((select public.is_super_admin(auth.uid())));


-- ─── 10. customers ───────────────────────────────────────────────────────────

drop policy if exists customers_elevated_read on public.customers;
create policy customers_elevated_read on public.customers
  for select using (
    (select public.is_super_admin(auth.uid()))
    or (select public.is_support(auth.uid()))
  );

drop policy if exists customers_venue_staff_read on public.customers;
create policy customers_venue_staff_read on public.customers
  for select using (
    exists (
      select 1 from public.reservations r
      where r.customer_id = public.customers.id
        and (
          (select public.can_access_venue(auth.uid(), r.requested_venue_id))
          or (r.assigned_venue_id is not null
              and (select public.can_access_venue(auth.uid(), r.assigned_venue_id)))
        )
    )
  );


-- ─── 11. reservations ────────────────────────────────────────────────────────

drop policy if exists reservations_read on public.reservations;
create policy reservations_read on public.reservations
  for select using (
    (select public.is_super_admin(auth.uid()))
    or (select public.is_support(auth.uid()))
    or (select public.can_access_venue(auth.uid(), requested_venue_id))
    or (assigned_venue_id is not null
        and (select public.can_access_venue(auth.uid(), assigned_venue_id)))
  );


-- ─── 12. reservation_tables ──────────────────────────────────────────────────

drop policy if exists reservation_tables_read on public.reservation_tables;
create policy reservation_tables_read on public.reservation_tables
  for select using (
    (select public.is_super_admin(auth.uid()))
    or (select public.is_support(auth.uid()))
    or (select public.can_access_venue(auth.uid(), venue_id))
  );


-- ─── 13. reservation_events ──────────────────────────────────────────────────

drop policy if exists reservation_events_read on public.reservation_events;
create policy reservation_events_read on public.reservation_events
  for select using (
    exists (
      select 1 from public.reservations r
      where r.id = public.reservation_events.reservation_id
        and (
          (select public.is_super_admin(auth.uid()))
          or (select public.is_support(auth.uid()))
          or (select public.can_access_venue(auth.uid(), r.requested_venue_id))
          or (r.assigned_venue_id is not null
              and (select public.can_access_venue(auth.uid(), r.assigned_venue_id)))
        )
    )
  );


commit;


-- ─── 14. Missing FK index: reservation_tables(reservation_id) ────────────────
-- The ON DELETE CASCADE FK exists but no index was present, causing full table
-- scans on cancel_reservation, mark_reservation_completed, and any
-- per-reservation lookup.
-- Outside the transaction so it can use CONCURRENTLY if you ever rerun on a
-- live table — for first-run on a small table the plain form is fine.

create index if not exists idx_reservation_tables_reservation
  on public.reservation_tables (reservation_id);
