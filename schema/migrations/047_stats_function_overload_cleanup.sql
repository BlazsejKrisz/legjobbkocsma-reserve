-- ============================================================================
-- Migration 047: stats function overload cleanup + schema cache reload
-- ============================================================================
-- The stats RPCs are emitting two distinct PostgREST errors on the
-- live system:
--
--   PGRST203 — ambiguity:
--     get_reservation_stats / get_source_stats / get_venue_stats each
--     have BOTH a 3-arg version (from migration 013) AND a 4-arg
--     version with p_timezone (added in migration 026).  Migration
--     026 used CREATE OR REPLACE without dropping the older
--     overload, so both signatures coexist.  PostgREST can't pick a
--     candidate when callers pass only the first 3 args, so it
--     errors with "Could not choose the best candidate function".
--
--   PGRST202 — not found:
--     get_dow_stats / get_hod_stats / get_lead_time_stats — the
--     PostgREST schema cache doesn't see them, even though
--     migration 032 creates them.  Most likely cause: the cache
--     never refreshed after the last DDL push.  PostgREST listens
--     for a NOTIFY pgrst, 'reload schema' message to invalidate
--     its in-memory schema cache.
--
-- This migration:
--   1. Drops the old 3-arg overloads.  Removes the ambiguity.  The
--      4-arg versions stay (with p_timezone defaulted to
--      'Europe/Budapest') so existing callers passing 3 args still
--      work — they just hit a single candidate.
--   2. Re-creates the dow/hod/lead_time functions (idempotent
--      CREATE OR REPLACE; safe even if they already exist).  This
--      forces a DDL change PostgREST will pick up.
--   3. Issues an explicit NOTIFY to reload the schema cache.
--
-- ── Safety notes ─────────────────────────────────────────────────────
-- * `DROP FUNCTION IF EXISTS … CASCADE` would drop dependent
--   objects.  We use plain DROP IF EXISTS — these stats functions
--   have no DB-side dependents (no triggers, no view refs).  Only
--   API routes call them via supabase-js, and the API code already
--   targets the 4-arg signature implicitly (via positional
--   argument names).
-- * The 4-arg versions are NOT redefined here — they exist from
--   migration 026 and don't need touching.
-- * NOTIFY runs at the end so all DDL has settled when PostgREST
--   re-reads the schema.
-- ============================================================================

begin;

-- ── 1. Drop old 3-arg stats overloads ───────────────────────────────────
drop function if exists public.get_reservation_stats(date, date, bigint);
drop function if exists public.get_source_stats(date, date, bigint);
drop function if exists public.get_venue_stats(date, date);

-- Some installs may have an even older 2-arg variant of get_venue_stats;
-- the migration history shows 3-arg but defensive drop is harmless.
drop function if exists public.get_venue_stats(date, date, bigint);

-- ── 2. Re-create dow/hod/lead_time stats from migration 032 ─────────────
-- Same bodies as 032; CREATE OR REPLACE is idempotent.  The point of
-- re-running is to force PostgREST to notice them in case the
-- original migration's DDL never propagated to the schema cache.

create or replace function public.get_dow_stats(
  p_from      date,
  p_to        date,
  p_venue_id  bigint  default null,
  p_timezone  text    default 'Europe/Budapest'
)
returns table (
  dow         smallint,
  total       integer,
  guests      integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with src as (
    select
      r.party_size,
      extract(dow from (r.starts_at at time zone p_timezone))::smallint as dow
    from public.reservations r
    where (r.starts_at at time zone p_timezone)::date between p_from and p_to
      and r.status <> 'cancelled'
      and (p_venue_id is null or r.requested_venue_id = p_venue_id)
  )
  select
    d.dow,
    count(s.dow)::integer                         as total,
    coalesce(sum(s.party_size), 0)::integer       as guests
  from generate_series(0, 6) d(dow)
  left join src s on s.dow = d.dow
  group by d.dow
  order by d.dow;
$$;

revoke execute on function public.get_dow_stats(date, date, bigint, text) from public;
grant  execute on function public.get_dow_stats(date, date, bigint, text) to authenticated, service_role;


create or replace function public.get_hod_stats(
  p_from      date,
  p_to        date,
  p_venue_id  bigint  default null,
  p_timezone  text    default 'Europe/Budapest'
)
returns table (
  hour        smallint,
  total       integer,
  guests      integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with src as (
    select
      r.party_size,
      extract(hour from (r.starts_at at time zone p_timezone))::smallint as hour
    from public.reservations r
    where (r.starts_at at time zone p_timezone)::date between p_from and p_to
      and r.status <> 'cancelled'
      and (p_venue_id is null or r.requested_venue_id = p_venue_id)
  )
  select
    h.hour,
    count(s.hour)::integer                       as total,
    coalesce(sum(s.party_size), 0)::integer      as guests
  from generate_series(0, 23) h(hour)
  left join src s on s.hour = h.hour
  group by h.hour
  order by h.hour;
$$;

revoke execute on function public.get_hod_stats(date, date, bigint, text) from public;
grant  execute on function public.get_hod_stats(date, date, bigint, text) to authenticated, service_role;


create or replace function public.get_lead_time_stats(
  p_from      date,
  p_to        date,
  p_venue_id  bigint  default null,
  p_timezone  text    default 'Europe/Budapest'
)
returns table (
  bucket      text,
  total       integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with src as (
    select
      case
        when r.starts_at - r.created_at < interval '1 day'    then 'same_day'
        when r.starts_at - r.created_at < interval '3 days'   then '1_2_days'
        when r.starts_at - r.created_at < interval '8 days'   then '3_7_days'
        when r.starts_at - r.created_at < interval '15 days'  then '1_2_weeks'
        else                                                       'over_2w'
      end as bucket
    from public.reservations r
    where (r.starts_at at time zone p_timezone)::date between p_from and p_to
      and r.status <> 'cancelled'
      and (p_venue_id is null or r.requested_venue_id = p_venue_id)
  ),
  buckets(bucket, ord) as (values
    ('same_day', 0),
    ('1_2_days', 1),
    ('3_7_days', 2),
    ('1_2_weeks', 3),
    ('over_2w', 4)
  )
  select
    b.bucket,
    coalesce(count(s.bucket), 0)::integer as total
  from buckets b
  left join src s on s.bucket = b.bucket
  group by b.bucket, b.ord
  order by b.ord;
$$;

revoke execute on function public.get_lead_time_stats(date, date, bigint, text) from public;
grant  execute on function public.get_lead_time_stats(date, date, bigint, text) to authenticated, service_role;

-- ── 3. Tighten grants on the 4-arg stats variants ───────────────────────
-- These exist from migration 026; ensure service_role can call them
-- (the API routes do, via the admin client).
grant execute on function public.get_reservation_stats(date, date, bigint, text) to service_role;
grant execute on function public.get_source_stats(date, date, bigint, text) to service_role;
grant execute on function public.get_venue_stats(date, date, text) to service_role;

commit;

-- ── 4. Force PostgREST to reload its schema cache ───────────────────────
-- Outside the transaction so the NOTIFY fires after DDL is committed.
-- PostgREST listens on the `pgrst` channel; this is the documented way
-- to invalidate the cache without restarting the API container.
-- Without this, PostgREST may continue serving the old (cached)
-- function inventory and the PGRST202/203 errors persist.
notify pgrst, 'reload schema';
