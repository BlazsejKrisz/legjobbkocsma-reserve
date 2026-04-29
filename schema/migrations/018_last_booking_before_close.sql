-- Configurable cutoff: how many minutes before close the last booking can start.
-- NULL = fall back to min_duration_minutes (existing behaviour unchanged).
-- Constrained between min_duration_minutes and max_duration_minutes.

ALTER TABLE public.venue_settings
  ADD COLUMN IF NOT EXISTS last_booking_before_close_minutes integer;

ALTER TABLE public.venue_settings
  ADD CONSTRAINT venue_settings_last_booking_chk CHECK (
    last_booking_before_close_minutes IS NULL
    OR (last_booking_before_close_minutes >= min_duration_minutes
        AND last_booking_before_close_minutes <= max_duration_minutes)
  );

-- Update is_within_venue_open_hours to enforce the cutoff.
-- A booking is only valid if it starts at least `cutoff` minutes before close.
CREATE OR REPLACE FUNCTION public.is_within_venue_open_hours(
  p_venue_id  bigint,
  p_starts_at timestamptz,
  p_ends_at   timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz     text;
  v_cutoff integer;
  local_start timestamp;
  local_end   timestamp;
  d1 date;
  d2 date;
  w1 record;
  w2 record;
BEGIN
  SELECT v.timezone INTO v_tz FROM public.venues v WHERE v.id = p_venue_id;

  SELECT COALESCE(vs.last_booking_before_close_minutes, vs.min_duration_minutes, 60)
  INTO v_cutoff
  FROM public.venue_settings vs
  WHERE vs.venue_id = p_venue_id;

  local_start := p_starts_at AT TIME ZONE v_tz;
  local_end   := p_ends_at   AT TIME ZONE v_tz;
  d1 := local_start::date;
  d2 := local_end::date;

  SELECT * INTO w1 FROM public.venue_business_window(p_venue_id, d1) LIMIT 1;

  IF p_starts_at >= w1.window_start
     AND p_ends_at <= w1.window_end
     AND p_starts_at + make_interval(mins => v_cutoff) <= w1.window_end THEN
    RETURN true;
  END IF;

  -- Check prior day's window in case close_time crosses midnight.
  SELECT * INTO w2 FROM public.venue_business_window(p_venue_id, d1 - 1) LIMIT 1;

  IF p_starts_at >= w2.window_start
     AND p_ends_at <= w2.window_end
     AND p_starts_at + make_interval(mins => v_cutoff) <= w2.window_end THEN
    RETURN true;
  END IF;

  IF d2 <> d1 THEN
    SELECT * INTO w2 FROM public.venue_business_window(p_venue_id, d2) LIMIT 1;

    IF p_starts_at >= w2.window_start
       AND p_ends_at <= w2.window_end
       AND p_starts_at + make_interval(mins => v_cutoff) <= w2.window_end THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;
