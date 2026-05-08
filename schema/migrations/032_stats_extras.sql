-- ============================================================================
-- Migration 032: Hospitality-relevant stats RPCs
-- ============================================================================
-- The existing get_reservation_stats / get_source_stats / get_venue_stats
-- cover "what happened day by day" but miss the patterns operators actually
-- act on:
--
--   • Day of week:   Saturday is N× busier than Tuesday — staff accordingly
--   • Hour of day:   when does the dinner rush actually peak?
--   • Lead time:     are most bookings same-day or planned a week ahead?
--                    (decides how aggressively to confirm overflow)
--
-- All three respect the same (p_from, p_to, p_venue_id, p_timezone) shape
-- as the existing functions for consistency.  Date filtering uses
-- starts_at converted to local date so the buckets match what staff sees
-- in the dashboard.
-- ============================================================================

-- ─── 1. Day-of-week distribution ─────────────────────────────────────────────
-- 0 = Sunday, 1 = Monday … 6 = Saturday (matches Postgres extract(dow))

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
grant execute on function public.get_dow_stats(date, date, bigint, text) to authenticated;


-- ─── 2. Hour-of-day distribution ─────────────────────────────────────────────
-- Histograms when bookings start (lunch rush, dinner rush, etc).

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
grant execute on function public.get_hod_stats(date, date, bigint, text) to authenticated;


-- ─── 3. Lead time distribution (booked → reservation date) ───────────────────
-- Buckets:
--   'same_day'    same-day bookings (delta < 1 day)
--   '1_2_days'    1–2 days ahead
--   '3_7_days'    3–7 days ahead
--   '1_2_weeks'   8–14 days ahead
--   'over_2w'     15+ days ahead
--
-- p_from / p_to filter on starts_at (the reserved date), as in the other
-- stats functions — so "lead time over the next 30 days" tells you how
-- planned upcoming bookings are.

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
grant execute on function public.get_lead_time_stats(date, date, bigint, text) to authenticated;
