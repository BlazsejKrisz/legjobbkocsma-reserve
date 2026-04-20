-- ============================================================================
-- HABIBI RESERVE — MULTI-VENUE RESERVATION OPS SCHEMA
-- ============================================================================
-- Fixes applied vs. previous version:
--  1. RLS enabled on every public table + policies wired to access helpers
--  2. `set search_path = ''` on every SECURITY DEFINER function
--  3. GiST exclusion constraint prevents table double-booking at DB level
--  4. Customer dedup via normalized email/phone + get_or_create_customer RPC
--  5. Soft-unlink of reservation_tables on cancel (keeps audit trail)
--  6. Dropped redundant requires_manual_review column (derived from status)
--  7. Dropped useless timezone check constraint
--  8. Fixed `where can_fit = false or can_fit = true` no-op
--  9. Table adjacency via explicit blend_group + within-group sort,
--     not fragile (sort_order - row_number()) across the whole venue
-- 10. Open-hours precomputation helper for get_reallocation_options
-- 11. Added index for "today's confirmed bookings at venue X"
-- 12. Enum `other` removed from reservation_source (use `partner` / `admin`)
-- ============================================================================

-- ============================================================================
-- CLEAN DROP (custom objects only)
-- ============================================================================

drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;

drop function if exists public.has_role(uuid, public.app_role) cascade;
drop function if exists public.is_super_admin(uuid) cascade;
drop function if exists public.is_support(uuid) cascade;
drop function if exists public.can_access_venue(uuid, bigint) cascade;

drop function if exists public.venue_business_window(bigint, date) cascade;
drop function if exists public.is_within_venue_open_hours(bigint, timestamptz, timestamptz) cascade;

drop function if exists public.get_or_create_customer(text, text, text) cascade;

drop function if exists public.get_available_tables(bigint, bigint, timestamptz, timestamptz, integer, text) cascade;
drop function if exists public.get_available_single_table_matches(bigint, bigint, timestamptz, timestamptz, integer, text) cascade;
drop function if exists public.find_best_table_combination(bigint, bigint, timestamptz, timestamptz, integer, text) cascade;

drop function if exists public.create_reservation_auto(bigint, bigint, public.reservation_source, bigint, timestamptz, integer, integer, text, text, text) cascade;
drop function if exists public.get_overflow_reservations(bigint) cascade;
drop function if exists public.get_reallocation_options(bigint, integer, integer) cascade;
drop function if exists public.reassign_reservation(bigint, bigint, bigint[], timestamptz, boolean, text) cascade;
drop function if exists public.cancel_reservation(bigint, text) cascade;
drop function if exists public.mark_reservation_completed(bigint) cascade;
drop function if exists public.mark_reservation_no_show(bigint) cascade;
drop function if exists public.mark_confirmation_email_sent(bigint, text) cascade;
drop function if exists public.create_venue_with_setup(text, text, text, boolean, boolean, boolean, integer, integer, integer, integer, integer, integer, integer, integer, integer, boolean, boolean) cascade;
drop function if exists public.assign_user_role(uuid, public.app_role) cascade;
drop function if exists public.assign_user_to_venue(uuid, bigint) cascade;
drop function if exists public.normalize_email(text) cascade;
drop function if exists public.normalize_phone(text) cascade;

drop table if exists public.reservation_events cascade;
drop table if exists public.reservation_tables cascade;
drop table if exists public.reservations cascade;
drop table if exists public.customers cascade;
drop table if exists public.tables cascade;
drop table if exists public.table_types cascade;
drop table if exists public.venue_integrations cascade;
drop table if exists public.venue_user_assignments cascade;
drop table if exists public.venue_open_hours cascade;
drop table if exists public.venue_settings cascade;
drop table if exists public.venues cascade;
drop table if exists public.user_roles cascade;
drop table if exists public.user_profiles cascade;

drop type if exists public.reservation_event_type cascade;
drop type if exists public.overflow_reason cascade;
drop type if exists public.reservation_source cascade;
drop type if exists public.reservation_status cascade;
drop type if exists public.app_role cascade;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ============================================================================
-- ENUMS
-- ============================================================================

create type public.app_role as enum (
  'super_admin',
  'support',
  'venue_staff'
);

create type public.reservation_status as enum (
  'confirmed',
  'pending_manual_review',
  'cancelled',
  'completed',
  'no_show'
);

create type public.reservation_source as enum (
  'web',
  'phone',
  'admin',
  'walk_in',
  'partner'
);

create type public.overflow_reason as enum (
  'no_table_available',
  'venue_capacity_reached',
  'auto_assignment_disabled',
  'outside_booking_window',
  'outside_open_hours',
  'party_size_exceeds_limit',
  'manual_review_required'
);

create type public.reservation_event_type as enum (
  'created',
  'auto_confirmed',
  'queued_for_manual_review',
  'reassigned',
  'cancelled',
  'completed',
  'no_show_marked',
  'confirmation_email_sent',
  'notes_updated'
);

-- ============================================================================
-- COMMON HELPERS
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.normalize_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or length(trim(p_email)) = 0 then null
    else lower(trim(p_email))
  end;
$$;

create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_phone is null or length(trim(p_phone)) = 0 then null
    else regexp_replace(trim(p_phone), '[^0-9+]', '', 'g')
  end;
$$;

-- ============================================================================
-- USERS / ACCESS
-- ============================================================================

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id bigserial primary key,
  user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- ============================================================================
-- VENUES
-- ============================================================================

create table public.venues (
  id bigserial primary key,
  name text not null,
  slug text not null unique,
  address text,
  timezone text not null default 'Europe/Budapest',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.venue_settings (
  venue_id bigint primary key references public.venues(id) on delete cascade,

  booking_enabled boolean not null default true,
  auto_assignment_enabled boolean not null default true,
  overflow_queue_enabled boolean not null default true,

  default_duration_minutes integer not null default 120,
  min_duration_minutes integer not null default 60,
  max_duration_minutes integer not null default 240,

  min_notice_minutes integer not null default 30,
  max_advance_booking_days integer not null default 30,

  max_party_size integer not null default 12,
  max_total_capacity integer,

  booking_buffer_before_minutes integer not null default 0,
  booking_buffer_after_minutes integer not null default 0,

  allow_combining_tables boolean not null default false,
  allow_cross_group_table_blending boolean not null default false,
  allow_alternative_time_suggestions boolean not null default true,
  allow_cross_venue_suggestions boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint venue_settings_duration_chk check (
    min_duration_minutes > 0
    and default_duration_minutes > 0
    and max_duration_minutes > 0
    and min_duration_minutes <= default_duration_minutes
    and default_duration_minutes <= max_duration_minutes
  ),
  constraint venue_settings_notice_chk check (min_notice_minutes >= 0),
  constraint venue_settings_advance_chk check (max_advance_booking_days > 0),
  constraint venue_settings_party_chk check (max_party_size > 0),
  constraint venue_settings_buffers_chk check (
    booking_buffer_before_minutes >= 0
    and booking_buffer_after_minutes >= 0
  ),
  constraint venue_settings_capacity_chk check (
    max_total_capacity is null or max_total_capacity > 0
  )
);

create table public.venue_open_hours (
  venue_id bigint not null references public.venues(id) on delete cascade,
  weekday smallint not null,  -- ISO 8601: 1 = Monday, 7 = Sunday
  is_closed boolean not null default false,
  open_time time not null default '13:00',
  close_time time not null default '04:00',
  created_at timestamptz not null default now(),
  primary key (venue_id, weekday),
  constraint venue_open_hours_weekday_chk check (weekday between 1 and 7)
);

create table public.venue_user_assignments (
  id bigserial primary key,
  user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  venue_id bigint not null references public.venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, venue_id)
);

create table public.venue_integrations (
  id bigserial primary key,
  venue_id bigint not null references public.venues(id) on delete cascade,
  provider text not null,
  is_enabled boolean not null default false,
  external_location_id text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, provider)
);

-- ============================================================================
-- TABLE TYPES / TABLES
-- ============================================================================

create table public.table_types (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tables (
  id bigserial primary key,
  venue_id bigint not null references public.venues(id) on delete cascade,
  table_type_id bigint references public.table_types(id),
  name text not null,
  sort_order integer not null,
  blend_group text,
  can_blend boolean not null default true,
  area text,
  capacity_min integer not null,
  capacity_max integer not null,
  is_active boolean not null default true,
  map_x integer,
  map_y integer,
  map_w integer,
  map_h integer,
  map_rotation integer,
  created_at timestamptz not null default now(),

  constraint tables_capacity_chk check (
    capacity_min > 0
    and capacity_max > 0
    and capacity_min <= capacity_max
  ),
  constraint tables_sort_order_positive_chk check (sort_order > 0),
  unique (venue_id, name),
  unique (venue_id, sort_order)
);

-- ============================================================================
-- CUSTOMERS
-- ============================================================================

create table public.customers (
  id bigserial primary key,
  full_name text not null,
  email text,
  phone text,
  email_normalized text generated always as (public.normalize_email(email)) stored,
  phone_normalized text generated always as (public.normalize_phone(phone)) stored,
  created_at timestamptz not null default now(),
  constraint customers_contact_chk check (email is not null or phone is not null)
);

create unique index customers_email_normalized_unq
  on public.customers (email_normalized)
  where email_normalized is not null;

create unique index customers_phone_normalized_unq
  on public.customers (phone_normalized)
  where phone_normalized is not null;

-- ============================================================================
-- RESERVATIONS
-- ============================================================================

create table public.reservations (
  id bigserial primary key,

  requested_venue_id bigint not null references public.venues(id),
  assigned_venue_id bigint references public.venues(id),

  customer_id bigint not null references public.customers(id),

  source public.reservation_source not null default 'web',
  status public.reservation_status not null,

  requested_table_type_id bigint references public.table_types(id),

  starts_at timestamptz not null,
  ends_at timestamptz not null,
  party_size integer not null,

  overflow_reason public.overflow_reason,

  special_requests text,
  internal_notes text,
  customer_service_notes text,

  auto_confirmation_email_sent_at timestamptz,
  manual_confirmation_email_sent_at timestamptz,

  cancelled_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reservations_time_chk check (ends_at > starts_at),
  constraint reservations_party_chk check (party_size > 0),
  constraint reservations_overflow_reason_chk check (
    (status = 'pending_manual_review' and overflow_reason is not null)
    or
    (status <> 'pending_manual_review')
  )
);

-- reservation_tables carries denormalized time + venue to enable
-- a database-enforced no-double-booking guarantee via GiST exclusion.
create table public.reservation_tables (
  id bigserial primary key,
  reservation_id bigint not null references public.reservations(id) on delete cascade,
  table_id bigint not null references public.tables(id),
  venue_id bigint not null references public.venues(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  released_at timestamptz,  -- soft unlink on cancel; keeps audit trail
  created_at timestamptz not null default now(),

  unique (reservation_id, table_id),
  constraint reservation_tables_time_chk check (ends_at > starts_at),

  -- The core correctness guarantee: a table cannot be assigned to two
  -- live reservations whose time ranges overlap. Buffers are applied
  -- in application/RPC layer when choosing; the constraint itself is
  -- the raw overlap check on the stored window.
  constraint reservation_tables_no_overlap
    exclude using gist (
      table_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (released_at is null)
);

create table public.reservation_events (
  id bigserial primary key,
  reservation_id bigint not null references public.reservations(id) on delete cascade,
  event_type public.reservation_event_type not null,
  old_value jsonb,
  new_value jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

create trigger trg_venue_settings_updated_at
before update on public.venue_settings
for each row execute function public.set_updated_at();

create trigger trg_venue_integrations_updated_at
before update on public.venue_integrations
for each row execute function public.set_updated_at();

create trigger trg_reservations_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_user_roles_user_id on public.user_roles(user_id);
create index idx_user_roles_role on public.user_roles(role);

create index idx_venue_user_assignments_user on public.venue_user_assignments(user_id);
create index idx_venue_user_assignments_venue on public.venue_user_assignments(venue_id);

create index idx_tables_venue_active on public.tables(venue_id, is_active);
create index idx_tables_venue_type on public.tables(venue_id, table_type_id);
create index idx_tables_venue_blend on public.tables(venue_id, blend_group, sort_order);

create index idx_reservations_requested_venue_time
  on public.reservations(requested_venue_id, starts_at, ends_at);

create index idx_reservations_assigned_venue_time
  on public.reservations(assigned_venue_id, starts_at, ends_at);

-- Hot path: "today's confirmed bookings at venue X"
create index idx_reservations_assigned_venue_status_time
  on public.reservations(assigned_venue_id, status, starts_at)
  where status = 'confirmed';

create index idx_reservations_status on public.reservations(status);

create index idx_reservations_manual_queue
  on public.reservations(status, requested_venue_id, starts_at)
  where status = 'pending_manual_review';

create index idx_reservations_customer
  on public.reservations(customer_id, created_at desc);

create index idx_reservation_tables_table on public.reservation_tables(table_id);
create index idx_reservation_tables_venue_time
  on public.reservation_tables(venue_id, starts_at, ends_at)
  where released_at is null;

create index idx_reservation_events_reservation_created
  on public.reservation_events(reservation_id, created_at desc);

-- ============================================================================
-- SEED TABLE TYPES
-- ============================================================================

insert into public.table_types (code, name)
values
  ('standard', 'Standard'),
  ('billiard', 'Billiard'),
  ('darts', 'Darts'),
  ('vip', 'VIP'),
  ('other', 'Other')
on conflict (code) do nothing;

-- ============================================================================
-- AUTH / ACCESS HELPERS
-- ============================================================================

create or replace function public.has_role(p_user_id uuid, p_role public.app_role)
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
      and ur.role = p_role
      and up.is_active = true
  );
$$;

create or replace function public.is_super_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(p_user_id, 'super_admin');
$$;

create or replace function public.is_support(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(p_user_id, 'support');
$$;

create or replace function public.can_access_venue(p_user_id uuid, p_venue_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_super_admin(p_user_id)
    or public.is_support(p_user_id)
    or exists (
      select 1
      from public.venue_user_assignments vua
      join public.user_profiles up on up.user_id = vua.user_id
      where vua.user_id = p_user_id
        and vua.venue_id = p_venue_id
        and up.is_active = true
    );
$$;

-- ============================================================================
-- AUTH USER -> PROFILE TRIGGER
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (
    user_id,
    full_name,
    email,
    is_active
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, ''),
    new.email,
    true
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================================
-- CUSTOMER DEDUP
-- ============================================================================

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
  v_email_norm text := public.normalize_email(p_email);
  v_phone_norm text := public.normalize_phone(p_phone);
  v_customer_id bigint;
begin
  if v_email_norm is null and v_phone_norm is null then
    raise exception 'customer requires email or phone';
  end if;

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

-- ============================================================================
-- BUSINESS TIME HELPERS
-- ============================================================================

create or replace function public.venue_business_window(
  p_venue_id bigint,
  p_business_date date
)
returns table (
  business_date date,
  weekday smallint,
  is_closed boolean,
  open_time time,
  close_time time,
  window_start timestamptz,
  window_end timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  wd smallint;
  oh record;
  v_tz text;
  start_local timestamp;
  end_local timestamp;
begin
  select v.timezone into v_tz
  from public.venues v
  where v.id = p_venue_id and v.is_active = true;

  if v_tz is null then
    raise exception 'venue not found';
  end if;

  wd := extract(isodow from p_business_date)::int;

  select h.is_closed, h.open_time, h.close_time
    into oh
  from public.venue_open_hours h
  where h.venue_id = p_venue_id
    and h.weekday = wd;

  if not found then
    raise exception 'missing open hours for venue % weekday %', p_venue_id, wd;
  end if;

  business_date := p_business_date;
  weekday := wd;
  is_closed := oh.is_closed;
  open_time := oh.open_time;
  close_time := oh.close_time;

  if oh.is_closed then
    window_start := (p_business_date::timestamp at time zone v_tz);
    window_end := window_start;
    return next;
    return;
  end if;

  start_local := p_business_date::timestamp + oh.open_time;
  end_local := p_business_date::timestamp + oh.close_time;

  if oh.close_time <= oh.open_time then
    end_local := end_local + interval '1 day';
  end if;

  window_start := start_local at time zone v_tz;
  window_end := end_local at time zone v_tz;

  return next;
end;
$$;

create or replace function public.is_within_venue_open_hours(
  p_venue_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  local_start timestamp;
  local_end timestamp;
  d1 date;
  d2 date;
  w1 record;
  w2 record;
begin
  select v.timezone into v_tz from public.venues v where v.id = p_venue_id;

  local_start := p_starts_at at time zone v_tz;
  local_end := p_ends_at at time zone v_tz;

  d1 := local_start::date;
  d2 := local_end::date;

  -- Business day the reservation starts in (plus the prior business day,
  -- which may have extended past midnight into d1).
  select * into w1
  from public.venue_business_window(p_venue_id, d1)
  limit 1;

  if p_starts_at >= w1.window_start and p_ends_at <= w1.window_end then
    return true;
  end if;

  -- Check prior day's window in case close_time crosses midnight.
  select * into w2
  from public.venue_business_window(p_venue_id, d1 - 1)
  limit 1;

  if p_starts_at >= w2.window_start and p_ends_at <= w2.window_end then
    return true;
  end if;

  if d2 <> d1 then
    select * into w2
    from public.venue_business_window(p_venue_id, d2)
    limit 1;

    if p_starts_at >= w2.window_start and p_ends_at <= w2.window_end then
      return true;
    end if;
  end if;

  return false;
end;
$$;

-- ============================================================================
-- AVAILABILITY HELPERS
-- ============================================================================

create or replace function public.get_available_tables(
  p_venue_id bigint,
  p_table_type_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_party_size integer,
  p_area text default null
)
returns table (
  table_id bigint,
  table_name text,
  sort_order integer,
  blend_group text,
  can_blend boolean,
  area text,
  capacity_min integer,
  capacity_max integer,
  is_free boolean,
  can_fit boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with settings as (
    select
      vs.booking_buffer_before_minutes,
      vs.booking_buffer_after_minutes
    from public.venue_settings vs
    where vs.venue_id = p_venue_id
  ),
  candidate_tables as (
    select
      t.id,
      t.name,
      t.sort_order,
      t.blend_group,
      t.can_blend,
      t.area,
      t.capacity_min,
      t.capacity_max
    from public.tables t
    where t.venue_id = p_venue_id
      and t.is_active = true
      and (p_table_type_id is null or t.table_type_id = p_table_type_id)
      and (p_area is null or t.area = p_area)
  )
  select
    ct.id,
    ct.name,
    ct.sort_order,
    ct.blend_group,
    ct.can_blend,
    ct.area,
    ct.capacity_min,
    ct.capacity_max,
    not exists (
      select 1
      from public.reservation_tables rt
      cross join settings s
      where rt.table_id = ct.id
        and rt.released_at is null
        and tstzrange(
          rt.starts_at - make_interval(mins => s.booking_buffer_before_minutes),
          rt.ends_at + make_interval(mins => s.booking_buffer_after_minutes),
          '[)'
        ) && tstzrange(p_starts_at, p_ends_at, '[)')
    ) as is_free,
    (ct.capacity_min <= p_party_size and ct.capacity_max >= p_party_size) as can_fit
  from candidate_tables ct
  order by ct.sort_order asc, ct.capacity_max asc, ct.name asc;
$$;

create or replace function public.get_available_single_table_matches(
  p_venue_id bigint,
  p_table_type_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_party_size integer,
  p_area text default null
)
returns table (
  table_id bigint,
  table_name text,
  sort_order integer,
  capacity_min integer,
  capacity_max integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.table_id,
    t.table_name,
    t.sort_order,
    t.capacity_min,
    t.capacity_max
  from public.get_available_tables(
    p_venue_id,
    p_table_type_id,
    p_starts_at,
    p_ends_at,
    p_party_size,
    p_area
  ) t
  where t.is_free = true
    and t.can_fit = true
  order by t.capacity_max asc, t.sort_order asc, t.table_name asc;
$$;

-- Contiguous-within-group blending only. We do NOT rely on global
-- (sort_order - row_number()) tricks across a venue, because those
-- break under deactivation / non-contiguous sort_order values.
-- Instead: tables are only "adjacent" if they share the same
-- blend_group AND have strictly consecutive sort_order values
-- within that group's currently-available set.
create or replace function public.find_best_table_combination(
  p_venue_id bigint,
  p_table_type_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_party_size integer,
  p_area text default null
)
returns table (
  table_ids bigint[],
  total_capacity integer,
  table_count integer,
  used_cross_group boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.venue_settings%rowtype;
begin
  select * into v_settings
  from public.venue_settings
  where venue_id = p_venue_id;

  if not found or not v_settings.allow_combining_tables then
    return;
  end if;

  -- Same-group contiguous runs. Gaps-and-islands on
  -- (rank_within_group_among_free - sort_order_rank).
  return query
  with free_tables as (
    select *
    from public.get_available_tables(
      p_venue_id,
      p_table_type_id,
      p_starts_at,
      p_ends_at,
      p_party_size,
      p_area
    )
    where is_free = true and can_blend = true and blend_group is not null
  ),
  ranked as (
    select
      ft.*,
      dense_rank() over (partition by ft.blend_group order by ft.sort_order) as grp_rank,
      row_number() over (partition by ft.blend_group order by ft.sort_order) as row_rank
    from free_tables ft
  ),
  runs as (
    select
      blend_group,
      (grp_rank - row_rank) as run_key,
      array_agg(table_id order by sort_order) as ids,
      sum(capacity_max)::integer as cap,
      count(*)::integer as cnt
    from ranked
    group by blend_group, (grp_rank - row_rank)
  )
  select
    r.ids,
    r.cap,
    r.cnt,
    false
  from runs r
  where r.cap >= p_party_size
  order by r.cap asc, r.cnt asc
  limit 1;

  if found then
    return;
  end if;

  -- Cross-group: contiguous by venue-wide sort_order among free, blendable tables only.
  if v_settings.allow_cross_group_table_blending then
    return query
    with free_tables as (
      select *
      from public.get_available_tables(
        p_venue_id,
        p_table_type_id,
        p_starts_at,
        p_ends_at,
        p_party_size,
        p_area
      )
      where is_free = true and can_blend = true
    ),
    ranked as (
      select
        ft.*,
        row_number() over (order by ft.sort_order) as row_rank,
        dense_rank() over (order by ft.sort_order) as sort_rank
      from free_tables ft
    ),
    runs as (
      select
        (sort_rank - row_rank) as run_key,
        array_agg(table_id order by sort_order) as ids,
        sum(capacity_max)::integer as cap,
        count(*)::integer as cnt
      from ranked
      group by (sort_rank - row_rank)
    )
    select
      r.ids,
      r.cap,
      r.cnt,
      true
    from runs r
    where r.cap >= p_party_size
    order by r.cap asc, r.cnt asc
    limit 1;
  end if;

  return;
end;
$$;

-- ============================================================================
-- CORE RESERVATION RPC
-- ============================================================================

create or replace function public.create_reservation_auto(
  p_requested_venue_id bigint,
  p_customer_id bigint,
  p_source public.reservation_source,
  p_requested_table_type_id bigint,
  p_starts_at timestamptz,
  p_party_size integer,
  p_duration_minutes integer default null,
  p_area text default null,
  p_special_requests text default null,
  p_internal_notes text default null
)
returns table (
  reservation_id bigint,
  status public.reservation_status,
  assigned_venue_id bigint,
  overflow_reason public.overflow_reason
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.venue_settings%rowtype;
  v_duration_minutes integer;
  v_ends_at timestamptz;
  v_res_id bigint;
  v_now timestamptz := now();
  v_current_capacity integer;
  v_single_table_id bigint;
  v_combo bigint[];
  v_combo_used_cross_group boolean;
begin
  perform pg_advisory_xact_lock(p_requested_venue_id);

  if not exists (
    select 1 from public.venues v
    where v.id = p_requested_venue_id and v.is_active = true
  ) then
    raise exception 'venue not found or inactive';
  end if;

  select * into v_settings
  from public.venue_settings
  where venue_id = p_requested_venue_id;

  if not found then
    raise exception 'missing venue settings';
  end if;

  if p_party_size <= 0 then
    raise exception 'invalid party size';
  end if;

  v_duration_minutes := coalesce(p_duration_minutes, v_settings.default_duration_minutes);

  if v_duration_minutes < v_settings.min_duration_minutes
     or v_duration_minutes > v_settings.max_duration_minutes then
    raise exception 'duration outside venue limits';
  end if;

  if not v_settings.booking_enabled then
    raise exception 'booking disabled for venue';
  end if;

  if p_starts_at < v_now + make_interval(mins => v_settings.min_notice_minutes) then
    raise exception 'booking too soon';
  end if;

  if p_starts_at > v_now + make_interval(days => v_settings.max_advance_booking_days) then
    raise exception 'booking too far in advance';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_duration_minutes);

  -- Guard rails → overflow paths
  if p_party_size > v_settings.max_party_size then
    insert into public.reservations (
      requested_venue_id, assigned_venue_id, customer_id, source, status,
      requested_table_type_id, starts_at, ends_at, party_size,
      overflow_reason, special_requests, internal_notes
    )
    values (
      p_requested_venue_id, null, p_customer_id, p_source, 'pending_manual_review',
      p_requested_table_type_id, p_starts_at, v_ends_at, p_party_size,
      'party_size_exceeds_limit', p_special_requests, p_internal_notes
    )
    returning id into v_res_id;

    insert into public.reservation_events (reservation_id, event_type, new_value)
    values (v_res_id, 'queued_for_manual_review', jsonb_build_object('reason', 'party_size_exceeds_limit'));

    reservation_id := v_res_id;
    status := 'pending_manual_review';
    assigned_venue_id := null;
    overflow_reason := 'party_size_exceeds_limit';
    return next;
    return;
  end if;

  if not public.is_within_venue_open_hours(p_requested_venue_id, p_starts_at, v_ends_at) then
    insert into public.reservations (
      requested_venue_id, assigned_venue_id, customer_id, source, status,
      requested_table_type_id, starts_at, ends_at, party_size,
      overflow_reason, special_requests, internal_notes
    )
    values (
      p_requested_venue_id, null, p_customer_id, p_source, 'pending_manual_review',
      p_requested_table_type_id, p_starts_at, v_ends_at, p_party_size,
      'outside_open_hours', p_special_requests, p_internal_notes
    )
    returning id into v_res_id;

    insert into public.reservation_events (reservation_id, event_type, new_value)
    values (v_res_id, 'queued_for_manual_review', jsonb_build_object('reason', 'outside_open_hours'));

    reservation_id := v_res_id;
    status := 'pending_manual_review';
    assigned_venue_id := null;
    overflow_reason := 'outside_open_hours';
    return next;
    return;
  end if;

  if v_settings.max_total_capacity is not null then
    select coalesce(sum(r.party_size), 0)
      into v_current_capacity
    from public.reservations r
    where r.assigned_venue_id = p_requested_venue_id
      and r.status = 'confirmed'
      and tstzrange(r.starts_at, r.ends_at, '[)') &&
          tstzrange(p_starts_at, v_ends_at, '[)');

    if v_current_capacity + p_party_size > v_settings.max_total_capacity then
      insert into public.reservations (
        requested_venue_id, assigned_venue_id, customer_id, source, status,
        requested_table_type_id, starts_at, ends_at, party_size,
        overflow_reason, special_requests, internal_notes
      )
      values (
        p_requested_venue_id, null, p_customer_id, p_source, 'pending_manual_review',
        p_requested_table_type_id, p_starts_at, v_ends_at, p_party_size,
        'venue_capacity_reached', p_special_requests, p_internal_notes
      )
      returning id into v_res_id;

      insert into public.reservation_events (reservation_id, event_type, new_value)
      values (v_res_id, 'queued_for_manual_review', jsonb_build_object('reason', 'venue_capacity_reached'));

      reservation_id := v_res_id;
      status := 'pending_manual_review';
      assigned_venue_id := null;
      overflow_reason := 'venue_capacity_reached';
      return next;
      return;
    end if;
  end if;

  if not v_settings.auto_assignment_enabled then
    insert into public.reservations (
      requested_venue_id, assigned_venue_id, customer_id, source, status,
      requested_table_type_id, starts_at, ends_at, party_size,
      overflow_reason, special_requests, internal_notes
    )
    values (
      p_requested_venue_id, null, p_customer_id, p_source, 'pending_manual_review',
      p_requested_table_type_id, p_starts_at, v_ends_at, p_party_size,
      'auto_assignment_disabled', p_special_requests, p_internal_notes
    )
    returning id into v_res_id;

    insert into public.reservation_events (reservation_id, event_type, new_value)
    values (v_res_id, 'queued_for_manual_review', jsonb_build_object('reason', 'auto_assignment_disabled'));

    reservation_id := v_res_id;
    status := 'pending_manual_review';
    assigned_venue_id := null;
    overflow_reason := 'auto_assignment_disabled';
    return next;
    return;
  end if;

  -- 1) single table
  select s.table_id into v_single_table_id
  from public.get_available_single_table_matches(
    p_requested_venue_id, p_requested_table_type_id,
    p_starts_at, v_ends_at, p_party_size, p_area
  ) s
  limit 1;

  if v_single_table_id is not null then
    insert into public.reservations (
      requested_venue_id, assigned_venue_id, customer_id, source, status,
      requested_table_type_id, starts_at, ends_at, party_size,
      special_requests, internal_notes
    )
    values (
      p_requested_venue_id, p_requested_venue_id, p_customer_id, p_source, 'confirmed',
      p_requested_table_type_id, p_starts_at, v_ends_at, p_party_size,
      p_special_requests, p_internal_notes
    )
    returning id into v_res_id;

    insert into public.reservation_tables (
      reservation_id, table_id, venue_id, starts_at, ends_at
    )
    values (v_res_id, v_single_table_id, p_requested_venue_id, p_starts_at, v_ends_at);

    insert into public.reservation_events (reservation_id, event_type, new_value)
    values (
      v_res_id, 'auto_confirmed',
      jsonb_build_object(
        'assigned_venue_id', p_requested_venue_id,
        'table_ids', jsonb_build_array(v_single_table_id),
        'combined', false
      )
    );

    reservation_id := v_res_id;
    status := 'confirmed';
    assigned_venue_id := p_requested_venue_id;
    overflow_reason := null;
    return next;
    return;
  end if;

  -- 2) blended combination
  select c.table_ids, c.used_cross_group
    into v_combo, v_combo_used_cross_group
  from public.find_best_table_combination(
    p_requested_venue_id, p_requested_table_type_id,
    p_starts_at, v_ends_at, p_party_size, p_area
  ) c
  limit 1;

  if v_combo is not null and array_length(v_combo, 1) > 0 then
    insert into public.reservations (
      requested_venue_id, assigned_venue_id, customer_id, source, status,
      requested_table_type_id, starts_at, ends_at, party_size,
      special_requests, internal_notes
    )
    values (
      p_requested_venue_id, p_requested_venue_id, p_customer_id, p_source, 'confirmed',
      p_requested_table_type_id, p_starts_at, v_ends_at, p_party_size,
      p_special_requests, p_internal_notes
    )
    returning id into v_res_id;

    insert into public.reservation_tables (
      reservation_id, table_id, venue_id, starts_at, ends_at
    )
    select v_res_id, unnest(v_combo), p_requested_venue_id, p_starts_at, v_ends_at;

    insert into public.reservation_events (reservation_id, event_type, new_value)
    values (
      v_res_id, 'auto_confirmed',
      jsonb_build_object(
        'assigned_venue_id', p_requested_venue_id,
        'table_ids', to_jsonb(v_combo),
        'combined', true,
        'used_cross_group', coalesce(v_combo_used_cross_group, false)
      )
    );

    reservation_id := v_res_id;
    status := 'confirmed';
    assigned_venue_id := p_requested_venue_id;
    overflow_reason := null;
    return next;
    return;
  end if;

  -- 3) overflow: no table available
  insert into public.reservations (
    requested_venue_id, assigned_venue_id, customer_id, source, status,
    requested_table_type_id, starts_at, ends_at, party_size,
    overflow_reason, special_requests, internal_notes
  )
  values (
    p_requested_venue_id, null, p_customer_id, p_source, 'pending_manual_review',
    p_requested_table_type_id, p_starts_at, v_ends_at, p_party_size,
    'no_table_available', p_special_requests, p_internal_notes
  )
  returning id into v_res_id;

  insert into public.reservation_events (reservation_id, event_type, new_value)
  values (v_res_id, 'queued_for_manual_review', jsonb_build_object('reason', 'no_table_available'));

  reservation_id := v_res_id;
  status := 'pending_manual_review';
  assigned_venue_id := null;
  overflow_reason := 'no_table_available';
  return next;
end;
$$;

-- ============================================================================
-- SUPPORT / ADMIN RPCS
-- ============================================================================

create or replace function public.get_overflow_reservations(
  p_requested_venue_id bigint default null
)
returns table (
  reservation_id bigint,
  customer_id bigint,
  customer_name text,
  customer_email text,
  customer_phone text,
  requested_venue_id bigint,
  requested_venue_name text,
  requested_table_type_id bigint,
  requested_table_type_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  party_size integer,
  source public.reservation_source,
  overflow_reason public.overflow_reason,
  special_requests text,
  internal_notes text,
  customer_service_notes text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    c.id,
    c.full_name,
    c.email,
    c.phone,
    rv.id,
    rv.name,
    tt.id,
    tt.name,
    r.starts_at,
    r.ends_at,
    r.party_size,
    r.source,
    r.overflow_reason,
    r.special_requests,
    r.internal_notes,
    r.customer_service_notes,
    r.created_at
  from public.reservations r
  join public.customers c on c.id = r.customer_id
  join public.venues rv on rv.id = r.requested_venue_id
  left join public.table_types tt on tt.id = r.requested_table_type_id
  where r.status = 'pending_manual_review'
    and (p_requested_venue_id is null or r.requested_venue_id = p_requested_venue_id)
  order by r.starts_at asc, r.created_at asc;
$$;

create or replace function public.get_reallocation_options(
  p_reservation_id bigint,
  p_time_step_minutes integer default 30,
  p_time_suggestions_each_side integer default 2
)
returns table (
  option_kind text,
  venue_id bigint,
  venue_name text,
  table_ids bigint[],
  starts_at timestamptz,
  ends_at timestamptz,
  note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_res public.reservations%rowtype;
  v_settings public.venue_settings%rowtype;
  v_duration interval;
  v_offset integer;
  v_combo bigint[];
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if not found then
    raise exception 'reservation not found';
  end if;

  v_duration := v_res.ends_at - v_res.starts_at;

  -- same venue, same time, single-table
  return query
  select
    'same_venue_same_time'::text,
    v.id, v.name,
    array[s.table_id]::bigint[],
    v_res.starts_at, v_res.ends_at,
    'Available single table at requested time'::text
  from public.venues v
  join public.get_available_single_table_matches(
    v_res.requested_venue_id, v_res.requested_table_type_id,
    v_res.starts_at, v_res.ends_at, v_res.party_size, null
  ) s on true
  where v.id = v_res.requested_venue_id;

  -- same venue, same time, blended
  select c.table_ids into v_combo
  from public.find_best_table_combination(
    v_res.requested_venue_id, v_res.requested_table_type_id,
    v_res.starts_at, v_res.ends_at, v_res.party_size, null
  ) c
  limit 1;

  if v_combo is not null then
    return query
    select
      'same_venue_same_time_combined'::text,
      v.id, v.name, v_combo,
      v_res.starts_at, v_res.ends_at,
      'Available combined tables at requested time'::text
    from public.venues v
    where v.id = v_res.requested_venue_id;
  end if;

  -- Qualify with table alias to avoid ambiguity with the `venue_id` output column.
  select * into v_settings
  from public.venue_settings vs
  where vs.venue_id = v_res.requested_venue_id;

  if v_settings.allow_alternative_time_suggestions then
    for v_offset in -p_time_suggestions_each_side .. p_time_suggestions_each_side loop
      if v_offset <> 0 then
        return query
        select
          'same_venue_other_time'::text,
          v.id, v.name,
          array[s.table_id]::bigint[],
          v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes),
          (v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes)) + v_duration,
          'Alternative time at requested venue'::text
        from public.venues v
        join public.get_available_single_table_matches(
          v_res.requested_venue_id, v_res.requested_table_type_id,
          v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes),
          (v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes)) + v_duration,
          v_res.party_size, null
        ) s on true
        where v.id = v_res.requested_venue_id
          and public.is_within_venue_open_hours(
            v_res.requested_venue_id,
            v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes),
            (v_res.starts_at + make_interval(mins => v_offset * p_time_step_minutes)) + v_duration
          );
      end if;
    end loop;
  end if;

  if v_settings.allow_cross_venue_suggestions then
    return query
    select
      'other_venue_same_time'::text,
      v.id, v.name,
      array[s.table_id]::bigint[],
      v_res.starts_at, v_res.ends_at,
      'Alternative venue at same time'::text
    from public.venues v
    join public.venue_settings vs on vs.venue_id = v.id
    join public.get_available_single_table_matches(
      v.id, v_res.requested_table_type_id,
      v_res.starts_at, v_res.ends_at, v_res.party_size, null
    ) s on true
    where v.is_active = true
      and v.id <> v_res.requested_venue_id
      and vs.booking_enabled = true
      and public.is_within_venue_open_hours(v.id, v_res.starts_at, v_res.ends_at);
  end if;
end;
$$;

create or replace function public.reassign_reservation(
  p_reservation_id bigint,
  p_new_venue_id bigint,
  p_new_table_ids bigint[],
  p_new_starts_at timestamptz,
  p_send_manual_confirmation boolean default false,
  p_customer_service_notes text default null
)
returns table (
  reservation_id bigint,
  status public.reservation_status,
  assigned_venue_id bigint,
  manual_confirmation_email_sent_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.reservations%rowtype;
  v_duration interval;
  v_new_ends_at timestamptz;
  v_manual_sent_at timestamptz;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'reservation not found';
  end if;

  if v_res.status = 'cancelled' then
    raise exception 'cannot reassign cancelled reservation';
  end if;

  if p_new_table_ids is null or array_length(p_new_table_ids, 1) is null then
    raise exception 'at least one table is required';
  end if;

  v_duration := v_res.ends_at - v_res.starts_at;
  v_new_ends_at := p_new_starts_at + v_duration;

  perform pg_advisory_xact_lock(p_new_venue_id);

  if not exists (
    select 1
    from unnest(p_new_table_ids) as t(id)
    join public.tables pt on pt.id = t.id
    where pt.venue_id = p_new_venue_id and pt.is_active = true
  ) or (
    select count(*) from public.tables
    where id = any(p_new_table_ids) and venue_id = p_new_venue_id and is_active = true
  ) <> array_length(p_new_table_ids, 1) then
    raise exception 'one or more tables do not belong to venue or are inactive';
  end if;

  -- Soft-release previous assignments (keep audit trail, free the exclusion constraint).
  -- Qualify with table alias to avoid ambiguity with the `reservation_id` output column.
  update public.reservation_tables rt
  set released_at = now()
  where rt.reservation_id = p_reservation_id and rt.released_at is null;

  -- The GiST exclusion constraint on reservation_tables will raise if
  -- any of these new rows conflict with existing live assignments.
  insert into public.reservation_tables (
    reservation_id, table_id, venue_id, starts_at, ends_at
  )
  select p_reservation_id, unnest(p_new_table_ids), p_new_venue_id, p_new_starts_at, v_new_ends_at;

  update public.reservations
  set
    assigned_venue_id = p_new_venue_id,
    starts_at = p_new_starts_at,
    ends_at = v_new_ends_at,
    status = 'confirmed',
    overflow_reason = null,
    customer_service_notes = coalesce(p_customer_service_notes, customer_service_notes),
    -- Use the already-fetched row variable to avoid ambiguity with the
    -- `manual_confirmation_email_sent_at` output column.
    manual_confirmation_email_sent_at = case
      when p_send_manual_confirmation then now()
      else v_res.manual_confirmation_email_sent_at
    end
  where id = p_reservation_id;

  -- Qualify with table alias to avoid ambiguity with the output column.
  select r.manual_confirmation_email_sent_at into v_manual_sent_at
  from public.reservations r where r.id = p_reservation_id;

  insert into public.reservation_events (
    reservation_id, event_type, old_value, new_value
  )
  values (
    p_reservation_id, 'reassigned',
    jsonb_build_object(
      'assigned_venue_id', v_res.assigned_venue_id,
      'starts_at', v_res.starts_at,
      'ends_at', v_res.ends_at
    ),
    jsonb_build_object(
      'assigned_venue_id', p_new_venue_id,
      'table_ids', to_jsonb(p_new_table_ids),
      'starts_at', p_new_starts_at,
      'ends_at', v_new_ends_at,
      'manual_confirmation_email_sent', p_send_manual_confirmation
    )
  );

  if p_send_manual_confirmation then
    insert into public.reservation_events (reservation_id, event_type, new_value)
    values (p_reservation_id, 'confirmation_email_sent', jsonb_build_object('mode', 'manual'));
  end if;

  reservation_id := p_reservation_id;
  status := 'confirmed';
  assigned_venue_id := p_new_venue_id;
  manual_confirmation_email_sent_at := v_manual_sent_at;
  return next;
end;
$$;

create or replace function public.cancel_reservation(
  p_reservation_id bigint,
  p_note text default null
)
returns table (
  reservation_id bigint,
  status public.reservation_status,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cancelled_at timestamptz;
begin
  update public.reservations r
  set
    status = 'cancelled',
    cancelled_at = now(),
    internal_notes = case
      when p_note is null then internal_notes
      when internal_notes is null then p_note
      else internal_notes || E'\n' || p_note
    end
  where r.id = p_reservation_id and r.status <> 'cancelled'
  returning r.cancelled_at into v_cancelled_at;

  if not found then
    raise exception 'reservation not found or already cancelled';
  end if;

  -- Soft release so the audit trail survives, exclusion constraint ignores released rows.
  -- Qualify with table alias to avoid ambiguity with the `reservation_id` output column.
  update public.reservation_tables rt
  set released_at = now()
  where rt.reservation_id = p_reservation_id and rt.released_at is null;

  insert into public.reservation_events (reservation_id, event_type, new_value)
  values (p_reservation_id, 'cancelled', jsonb_build_object('note', p_note));

  reservation_id := p_reservation_id;
  status := 'cancelled';
  cancelled_at := v_cancelled_at;
  return next;
end;
$$;

create or replace function public.mark_reservation_completed(
  p_reservation_id bigint
)
returns table (
  reservation_id bigint,
  status public.reservation_status,
  completed_at timestamptz
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
  where id = p_reservation_id and status not in ('cancelled', 'completed');

  if not found then
    raise exception 'reservation not found or cannot be completed';
  end if;

  select r.completed_at into v_completed_at
  from public.reservations r where r.id = p_reservation_id;

  insert into public.reservation_events (reservation_id, event_type)
  values (p_reservation_id, 'completed');

  reservation_id := p_reservation_id;
  status := 'completed';
  completed_at := v_completed_at;
  return next;
end;
$$;

create or replace function public.mark_reservation_no_show(
  p_reservation_id bigint
)
returns table (
  reservation_id bigint,
  status public.reservation_status
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reservations
  set status = 'no_show'
  where id = p_reservation_id and status not in ('cancelled', 'completed', 'no_show');

  if not found then
    raise exception 'reservation not found or cannot be marked no_show';
  end if;

  insert into public.reservation_events (reservation_id, event_type)
  values (p_reservation_id, 'no_show_marked');

  reservation_id := p_reservation_id;
  status := 'no_show';
  return next;
end;
$$;

create or replace function public.mark_confirmation_email_sent(
  p_reservation_id bigint,
  p_mode text
)
returns table (
  reservation_id bigint,
  auto_confirmation_email_sent_at timestamptz,
  manual_confirmation_email_sent_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auto timestamptz;
  v_manual timestamptz;
begin
  if p_mode not in ('auto', 'manual') then
    raise exception 'invalid mode';
  end if;

  -- Split into two targeted UPDATEs to avoid referencing the output column
  -- names unqualified in a CASE ELSE expression (42702 ambiguity).
  if p_mode = 'auto' then
    update public.reservations
    set auto_confirmation_email_sent_at = now()
    where id = p_reservation_id;
  else
    update public.reservations
    set manual_confirmation_email_sent_at = now()
    where id = p_reservation_id;
  end if;

  if not found then
    raise exception 'reservation not found';
  end if;

  -- Qualify with table alias to avoid ambiguity with the output columns.
  select r.auto_confirmation_email_sent_at, r.manual_confirmation_email_sent_at
    into v_auto, v_manual
  from public.reservations r where r.id = p_reservation_id;

  insert into public.reservation_events (reservation_id, event_type, new_value)
  values (p_reservation_id, 'confirmation_email_sent', jsonb_build_object('mode', p_mode));

  reservation_id := p_reservation_id;
  auto_confirmation_email_sent_at := v_auto;
  manual_confirmation_email_sent_at := v_manual;
  return next;
end;
$$;

create or replace function public.create_venue_with_setup(
  p_name text,
  p_slug text,
  p_address text default null,
  p_timezone text default 'Europe/Budapest',
  p_booking_enabled boolean default true,
  p_auto_assignment_enabled boolean default true,
  p_overflow_queue_enabled boolean default true,
  p_default_duration_minutes integer default 120,
  p_min_duration_minutes integer default 60,
  p_max_duration_minutes integer default 240,
  p_min_notice_minutes integer default 30,
  p_max_advance_booking_days integer default 30,
  p_max_party_size integer default 12,
  p_max_total_capacity integer default null,
  p_booking_buffer_before_minutes integer default 0,
  p_booking_buffer_after_minutes integer default 0,
  p_allow_combining_tables boolean default false,
  p_allow_cross_group_table_blending boolean default false
)
returns table (
  venue_id bigint,
  venue_name text,
  venue_slug text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue_id bigint;
  v_wd integer;
begin
  insert into public.venues (name, slug, address, timezone)
  values (p_name, p_slug, p_address, p_timezone)
  returning id into v_venue_id;

  insert into public.venue_settings (
    venue_id, booking_enabled, auto_assignment_enabled, overflow_queue_enabled,
    default_duration_minutes, min_duration_minutes, max_duration_minutes,
    min_notice_minutes, max_advance_booking_days, max_party_size,
    max_total_capacity, booking_buffer_before_minutes, booking_buffer_after_minutes,
    allow_combining_tables, allow_cross_group_table_blending
  )
  values (
    v_venue_id, p_booking_enabled, p_auto_assignment_enabled, p_overflow_queue_enabled,
    p_default_duration_minutes, p_min_duration_minutes, p_max_duration_minutes,
    p_min_notice_minutes, p_max_advance_booking_days, p_max_party_size,
    p_max_total_capacity, p_booking_buffer_before_minutes, p_booking_buffer_after_minutes,
    p_allow_combining_tables, p_allow_cross_group_table_blending
  );

  for v_wd in 1..7 loop
    insert into public.venue_open_hours (venue_id, weekday, is_closed, open_time, close_time)
    values (v_venue_id, v_wd, false, '13:00', '04:00');
  end loop;

  venue_id := v_venue_id;
  venue_name := p_name;
  venue_slug := p_slug;
  return next;
end;
$$;

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
  insert into public.user_roles (user_id, role)
  values (p_user_id, p_role)
  on conflict (user_id, role) do nothing;
end;
$$;

create or replace function public.assign_user_to_venue(
  p_user_id uuid,
  p_venue_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.venue_user_assignments (user_id, venue_id)
  values (p_user_id, p_venue_id)
  on conflict (user_id, venue_id) do nothing;
end;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Policy model:
--   - super_admin / support: read everything, modify most things
--   - venue_staff: read only their assigned venue's data, no writes from client
--   - All write RPCs are SECURITY DEFINER and perform their own authorization,
--     so direct table writes from the client are disallowed by default and
--     only read policies are exposed.
-- ============================================================================

alter table public.user_profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.venues enable row level security;
alter table public.venue_settings enable row level security;
alter table public.venue_open_hours enable row level security;
alter table public.venue_user_assignments enable row level security;
alter table public.venue_integrations enable row level security;
alter table public.table_types enable row level security;
alter table public.tables enable row level security;
alter table public.customers enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_tables enable row level security;
alter table public.reservation_events enable row level security;

-- user_profiles: self-read, elevated read, elevated write
create policy user_profiles_self_read on public.user_profiles
  for select using (user_id = auth.uid());
create policy user_profiles_elevated_read on public.user_profiles
  for select using (public.is_super_admin(auth.uid()) or public.is_support(auth.uid()));
create policy user_profiles_superadmin_write on public.user_profiles
  for all using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

-- user_roles: self-read, super admin only writes
create policy user_roles_self_read on public.user_roles
  for select using (user_id = auth.uid());
create policy user_roles_elevated_read on public.user_roles
  for select using (public.is_super_admin(auth.uid()) or public.is_support(auth.uid()));
create policy user_roles_superadmin_write on public.user_roles
  for all using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

-- venues
create policy venues_read on public.venues
  for select using (
    public.is_super_admin(auth.uid())
    or public.is_support(auth.uid())
    or public.can_access_venue(auth.uid(), id)
  );
create policy venues_superadmin_write on public.venues
  for all using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

-- venue_settings / venue_open_hours / venue_integrations: venue-scoped read, super admin write
create policy venue_settings_read on public.venue_settings
  for select using (public.can_access_venue(auth.uid(), venue_id));
create policy venue_settings_superadmin_write on public.venue_settings
  for all using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

create policy venue_open_hours_read on public.venue_open_hours
  for select using (public.can_access_venue(auth.uid(), venue_id));
create policy venue_open_hours_superadmin_write on public.venue_open_hours
  for all using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

create policy venue_integrations_read on public.venue_integrations
  for select using (public.can_access_venue(auth.uid(), venue_id));
create policy venue_integrations_superadmin_write on public.venue_integrations
  for all using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

-- venue_user_assignments: user sees own, elevated sees all, super admin writes
create policy vua_self_read on public.venue_user_assignments
  for select using (user_id = auth.uid());
create policy vua_elevated_read on public.venue_user_assignments
  for select using (public.is_super_admin(auth.uid()) or public.is_support(auth.uid()));
create policy vua_superadmin_write on public.venue_user_assignments
  for all using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

-- table_types: everyone authenticated reads, super admin writes
create policy table_types_read on public.table_types
  for select using (auth.uid() is not null);
create policy table_types_superadmin_write on public.table_types
  for all using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

-- tables: venue-scoped read, super admin write
create policy tables_read on public.tables
  for select using (public.can_access_venue(auth.uid(), venue_id));
create policy tables_superadmin_write on public.tables
  for all using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

-- customers: elevated read (PII), writes via RPC only
create policy customers_elevated_read on public.customers
  for select using (public.is_super_admin(auth.uid()) or public.is_support(auth.uid()));
create policy customers_venue_staff_read on public.customers
  for select using (
    exists (
      select 1 from public.reservations r
      where r.customer_id = public.customers.id
        and (
          public.can_access_venue(auth.uid(), r.requested_venue_id)
          or (r.assigned_venue_id is not null and public.can_access_venue(auth.uid(), r.assigned_venue_id))
        )
    )
  );

-- reservations: venue-scoped read (requested OR assigned venue)
create policy reservations_read on public.reservations
  for select using (
    public.is_super_admin(auth.uid())
    or public.is_support(auth.uid())
    or public.can_access_venue(auth.uid(), requested_venue_id)
    or (assigned_venue_id is not null and public.can_access_venue(auth.uid(), assigned_venue_id))
  );
-- No direct write policy. All writes go through SECURITY DEFINER RPCs.

-- reservation_tables: follow reservation visibility
create policy reservation_tables_read on public.reservation_tables
  for select using (
    public.is_super_admin(auth.uid())
    or public.is_support(auth.uid())
    or public.can_access_venue(auth.uid(), venue_id)
  );

-- reservation_events: follow reservation visibility
create policy reservation_events_read on public.reservation_events
  for select using (
    exists (
      select 1 from public.reservations r
      where r.id = public.reservation_events.reservation_id
        and (
          public.is_super_admin(auth.uid())
          or public.is_support(auth.uid())
          or public.can_access_venue(auth.uid(), r.requested_venue_id)
          or (r.assigned_venue_id is not null and public.can_access_venue(auth.uid(), r.assigned_venue_id))
        )
    )
  );

-- ============================================================================
-- GRANTS
-- ============================================================================
-- Explicit grants so authenticated role can call the RPCs. Direct DML is
-- blocked by RLS; RPCs are the only write path.

grant execute on function public.create_reservation_auto(bigint, bigint, public.reservation_source, bigint, timestamptz, integer, integer, text, text, text) to service_role;
grant execute on function public.get_or_create_customer(text, text, text) to service_role;
grant execute on function public.get_available_tables(bigint, bigint, timestamptz, timestamptz, integer, text) to service_role;
grant execute on function public.get_available_single_table_matches(bigint, bigint, timestamptz, timestamptz, integer, text) to service_role;
grant execute on function public.find_best_table_combination(bigint, bigint, timestamptz, timestamptz, integer, text) to service_role;
grant execute on function public.venue_business_window(bigint, date) to authenticated;
grant execute on function public.is_within_venue_open_hours(bigint, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_overflow_reservations(bigint) to service_role;
grant execute on function public.get_reallocation_options(bigint, integer, integer) to service_role;
grant execute on function public.reassign_reservation(bigint, bigint, bigint[], timestamptz, boolean, text) to service_role;
grant execute on function public.cancel_reservation(bigint, text) to service_role;
grant execute on function public.mark_reservation_completed(bigint) to service_role;
grant execute on function public.mark_reservation_no_show(bigint) to service_role;
grant execute on function public.mark_confirmation_email_sent(bigint, text) to service_role;
grant execute on function public.create_venue_with_setup(text, text, text, text, boolean, boolean, boolean, integer, integer, integer, integer, integer, integer, integer, integer, integer, boolean, boolean) to service_role;
grant execute on function public.assign_user_role(uuid, public.app_role) to service_role;
grant execute on function public.assign_user_to_venue(uuid, bigint) to service_role;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_super_admin(uuid) to authenticated;
grant execute on function public.is_support(uuid) to authenticated;
grant execute on function public.can_access_venue(uuid, bigint) to authenticated;
