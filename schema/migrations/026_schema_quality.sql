-- ============================================================================
-- Migration 026: Schema quality improvements
-- ============================================================================
-- Fixes:
--   1. partner_api_keys RLS used auth.jwt() claim instead of is_super_admin()
--   2. can_access_venue made 3 separate DB round-trips; collapsed to 1 query
--   3. mark_reservation_completed did UPDATE then a separate SELECT for
--      completed_at; fixed with RETURNING
--   4. Stats functions hardcoded 'Europe/Budapest'; now parameterised with a
--      backward-compatible default
--   5. Missing GIN trigram indexes for customer ILIKE search
--   6. Missing composite index on embed_events for analytics queries
-- ============================================================================

-- ─── 1. Fix partner_api_keys RLS ─────────────────────────────────────────────
-- The table is created by migration 022.  The original policy was named
-- "super_admin can manage partner_api_keys" and used auth.jwt() ->> 'role'
-- which doesn't match how this app stores roles (in user_roles, not JWT
-- claims).  Replace it with a policy that calls our is_super_admin() helper.
-- Guarded so this migration can run even if 022 hasn't been applied yet.

do $$
begin
  if to_regclass('public.partner_api_keys') is not null then
    execute 'drop policy if exists "super_admin can manage partner_api_keys" on public.partner_api_keys';
    execute 'drop policy if exists "super_admins_manage_api_keys" on public.partner_api_keys';
    execute $p$
      create policy "super_admins_manage_api_keys" on public.partner_api_keys
        for all
        using (public.is_super_admin(auth.uid()))
        with check (public.is_super_admin(auth.uid()))
    $p$;
  end if;
end $$;


-- ─── 2. Optimise can_access_venue ────────────────────────────────────────────
-- Previous version called is_super_admin() + is_support() (each a separate
-- DB hit) before falling back to a venue_user_assignments lookup — 3 potential
-- round-trips per row evaluated by an RLS policy.  Collapsed to 1 query.

create or replace function public.can_access_venue(p_user_id uuid, p_venue_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.user_profiles up on up.user_id = ur.user_id
    where ur.user_id = p_user_id
      and up.is_active = true
      and (
        ur.role in ('super_admin', 'support')
        or exists (
          select 1
          from public.venue_user_assignments vua
          where vua.user_id = p_user_id
            and vua.venue_id = p_venue_id
        )
      )
  );
$$;


-- ─── 3. Fix mark_reservation_completed — use RETURNING ───────────────────────

create or replace function public.mark_reservation_completed(
  p_reservation_id bigint
)
returns table (
  reservation_id bigint,
  status         public.reservation_status,
  completed_at   timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed_at timestamptz;
begin
  update public.reservations
  set status = 'completed', completed_at = now()
  where id = p_reservation_id
    and status not in ('cancelled', 'completed')
  returning completed_at into v_completed_at;

  if not found then
    raise exception 'reservation not found or cannot be completed';
  end if;

  update public.reservation_tables rt
  set released_at = now()
  where rt.reservation_id = p_reservation_id
    and rt.released_at is null;

  insert into public.reservation_events (reservation_id, event_type)
  values (p_reservation_id, 'completed');

  reservation_id := p_reservation_id;
  status         := 'completed';
  completed_at   := v_completed_at;
  return next;
end;
$$;


-- ─── 4. Parameterise timezone in stats functions ──────────────────────────────
-- Adds p_timezone text default 'Europe/Budapest' — fully backward-compatible
-- since existing callers don't pass this argument.

create or replace function public.get_reservation_stats(
  p_from      date,
  p_to        date,
  p_venue_id  bigint  default null,
  p_timezone  text    default 'Europe/Budapest'
)
returns table (
  day          date,
  total        integer,
  confirmed    integer,
  cancelled    integer,
  no_show      integer,
  completed    integer,
  overflow     integer,
  total_guests integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (r.starts_at at time zone p_timezone)::date              as day,
    count(*)::integer                                        as total,
    count(*) filter (where r.status = 'confirmed')::integer  as confirmed,
    count(*) filter (where r.status = 'cancelled')::integer  as cancelled,
    count(*) filter (where r.status = 'no_show')::integer    as no_show,
    count(*) filter (where r.status = 'completed')::integer  as completed,
    count(*) filter (where r.status = 'pending_manual_review')::integer as overflow,
    coalesce(sum(r.party_size), 0)::integer                  as total_guests
  from public.reservations r
  where (r.starts_at at time zone p_timezone)::date between p_from and p_to
    and (p_venue_id is null or r.requested_venue_id = p_venue_id)
  group by 1
  order by 1;
$$;
grant execute on function public.get_reservation_stats(date, date, bigint, text) to authenticated;


create or replace function public.get_source_stats(
  p_from     date,
  p_to       date,
  p_venue_id bigint default null,
  p_timezone text   default 'Europe/Budapest'
)
returns table (
  source text,
  total  integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.source::text,
    count(*)::integer as total
  from public.reservations r
  where (r.starts_at at time zone p_timezone)::date between p_from and p_to
    and (p_venue_id is null or r.requested_venue_id = p_venue_id)
  group by r.source
  order by total desc;
$$;
grant execute on function public.get_source_stats(date, date, bigint, text) to authenticated;


create or replace function public.get_venue_stats(
  p_from     date,
  p_to       date,
  p_timezone text default 'Europe/Budapest'
)
returns table (
  venue_id   bigint,
  venue_name text,
  total      integer,
  confirmed  integer,
  cancelled  integer,
  guests     integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id                                                               as venue_id,
    v.name                                                             as venue_name,
    count(r.id)::integer                                               as total,
    count(r.id) filter (where r.status = 'confirmed')::integer         as confirmed,
    count(r.id) filter (where r.status = 'cancelled')::integer         as cancelled,
    coalesce(sum(r.party_size), 0)::integer                            as guests
  from public.venues v
  left join public.reservations r
    on r.requested_venue_id = v.id
    and (r.starts_at at time zone p_timezone)::date between p_from and p_to
  where v.is_active = true
  group by v.id, v.name
  order by total desc;
$$;
grant execute on function public.get_venue_stats(date, date, text) to authenticated;


-- ─── 5. Trigram indexes for customer search ───────────────────────────────────
-- get_customer_list / get_customer_count run ILIKE '%term%' on three columns.
-- GIN trigram indexes make these O(log n) instead of full-table-scan.

create extension if not exists pg_trgm;

create index if not exists idx_customers_full_name_trgm
  on public.customers using gin (full_name gin_trgm_ops);

create index if not exists idx_customers_email_trgm
  on public.customers using gin (email gin_trgm_ops);

create index if not exists idx_customers_phone_trgm
  on public.customers using gin (phone gin_trgm_ops);


-- ─── 6. Composite index on embed_events ──────────────────────────────────────

create index if not exists idx_embed_events_venue_slug_created
  on public.embed_events (venue_slug, created_at desc);
