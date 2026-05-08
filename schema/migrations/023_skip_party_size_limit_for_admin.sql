-- Adds p_skip_party_size_limit to create_reservation_auto so internal/admin
-- bookings can bypass the per-venue party size cap while public API bookings
-- still route oversized parties to the overflow queue.
drop function if exists public.create_reservation_auto(bigint, bigint, public.reservation_source, bigint, timestamptz, integer, integer, text, text, text) cascade;

create or replace function public.create_reservation_auto(
  p_requested_venue_id        bigint,
  p_customer_id               bigint,
  p_source                    public.reservation_source,
  p_requested_table_type_id   bigint,
  p_starts_at                 timestamptz,
  p_party_size                integer,
  p_duration_minutes          integer  default null,
  p_area                      text     default null,
  p_special_requests          text     default null,
  p_internal_notes            text     default null,
  p_skip_party_size_limit     boolean  default false
)
returns table (
  reservation_id   bigint,
  status           public.reservation_status,
  assigned_venue_id bigint,
  overflow_reason  public.overflow_reason
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings              public.venue_settings%rowtype;
  v_duration_minutes      integer;
  v_ends_at               timestamptz;
  v_res_id                bigint;
  v_now                   timestamptz := now();
  v_current_capacity      integer;
  v_single_table_id       bigint;
  v_combo                 bigint[];
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
  -- Party size limit only applies when NOT skipped (i.e. public/partner API)
  if not p_skip_party_size_limit and p_party_size > v_settings.max_party_size then
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

    reservation_id    := v_res_id;
    status            := 'pending_manual_review';
    assigned_venue_id := null;
    overflow_reason   := 'party_size_exceeds_limit';
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

    reservation_id    := v_res_id;
    status            := 'pending_manual_review';
    assigned_venue_id := null;
    overflow_reason   := 'outside_open_hours';
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

      reservation_id    := v_res_id;
      status            := 'pending_manual_review';
      assigned_venue_id := null;
      overflow_reason   := 'venue_capacity_reached';
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

    reservation_id    := v_res_id;
    status            := 'pending_manual_review';
    assigned_venue_id := null;
    overflow_reason   := 'auto_assignment_disabled';
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

    reservation_id    := v_res_id;
    status            := 'confirmed';
    assigned_venue_id := p_requested_venue_id;
    overflow_reason   := null;
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

    reservation_id    := v_res_id;
    status            := 'confirmed';
    assigned_venue_id := p_requested_venue_id;
    overflow_reason   := null;
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

  reservation_id    := v_res_id;
  status            := 'pending_manual_review';
  assigned_venue_id := null;
  overflow_reason   := 'no_table_available';
  return next;
end;
$$;

grant execute on function public.create_reservation_auto(bigint, bigint, public.reservation_source, bigint, timestamptz, integer, integer, text, text, text, boolean) to service_role;
