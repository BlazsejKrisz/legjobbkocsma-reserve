-- ============================================================================
-- Migration 013: Stats functions + customer list helper
-- ============================================================================

-- ─── Daily reservation stats (for charts) ────────────────────────────────────
create or replace function public.get_reservation_stats(
  p_from      date,
  p_to        date,
  p_venue_id  bigint default null
)
returns table (
  day           date,
  total         integer,
  confirmed     integer,
  cancelled     integer,
  no_show       integer,
  completed     integer,
  overflow      integer,
  total_guests  integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (r.starts_at at time zone 'Europe/Budapest')::date as day,
    count(*)::integer                                                          as total,
    count(*) filter (where r.status = 'confirmed')::integer                   as confirmed,
    count(*) filter (where r.status = 'cancelled')::integer                   as cancelled,
    count(*) filter (where r.status = 'no_show')::integer                     as no_show,
    count(*) filter (where r.status = 'completed')::integer                   as completed,
    count(*) filter (where r.status = 'pending_manual_review')::integer       as overflow,
    coalesce(sum(r.party_size), 0)::integer                                   as total_guests
  from public.reservations r
  where
    (r.starts_at at time zone 'Europe/Budapest')::date between p_from and p_to
    and (p_venue_id is null or r.requested_venue_id = p_venue_id)
  group by 1
  order by 1;
$$;
grant execute on function public.get_reservation_stats(date, date, bigint) to authenticated;


-- ─── Source breakdown ─────────────────────────────────────────────────────────
create or replace function public.get_source_stats(
  p_from     date,
  p_to       date,
  p_venue_id bigint default null
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
  where
    (r.starts_at at time zone 'Europe/Budapest')::date between p_from and p_to
    and (p_venue_id is null or r.requested_venue_id = p_venue_id)
  group by r.source
  order by total desc;
$$;
grant execute on function public.get_source_stats(date, date, bigint) to authenticated;


-- ─── Per-venue breakdown ──────────────────────────────────────────────────────
create or replace function public.get_venue_stats(
  p_from date,
  p_to   date
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
    v.id                                                                as venue_id,
    v.name                                                              as venue_name,
    count(r.id)::integer                                                as total,
    count(r.id) filter (where r.status = 'confirmed')::integer          as confirmed,
    count(r.id) filter (where r.status = 'cancelled')::integer          as cancelled,
    coalesce(sum(r.party_size), 0)::integer                             as guests
  from public.venues v
  left join public.reservations r
    on r.requested_venue_id = v.id
    and (r.starts_at at time zone 'Europe/Budapest')::date between p_from and p_to
  where v.is_active = true
  group by v.id, v.name
  order by total desc;
$$;
grant execute on function public.get_venue_stats(date, date) to authenticated;


-- ─── Customer list with reservation stats ─────────────────────────────────────
create or replace function public.get_customer_list(
  p_search text    default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id                   bigint,
  full_name            text,
  email                text,
  phone                text,
  created_at           timestamptz,
  total_reservations   bigint,
  last_reservation_at  timestamptz,
  total_guests         bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.full_name,
    c.email,
    c.phone,
    c.created_at,
    count(r.id)                         as total_reservations,
    max(r.starts_at)                    as last_reservation_at,
    coalesce(sum(r.party_size), 0)      as total_guests
  from public.customers c
  left join public.reservations r on r.customer_id = c.id
  where
    p_search is null
    or c.full_name ilike '%' || p_search || '%'
    or c.email     ilike '%' || p_search || '%'
    or c.phone     ilike '%' || p_search || '%'
  group by c.id
  order by max(r.starts_at) desc nulls last, c.created_at desc
  limit p_limit
  offset p_offset;
$$;
grant execute on function public.get_customer_list(text, integer, integer) to authenticated;


-- ─── Customer count (for pagination) ─────────────────────────────────────────
create or replace function public.get_customer_count(
  p_search text default null
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.customers c
  where
    p_search is null
    or c.full_name ilike '%' || p_search || '%'
    or c.email     ilike '%' || p_search || '%'
    or c.phone     ilike '%' || p_search || '%';
$$;
grant execute on function public.get_customer_count(text) to authenticated;
