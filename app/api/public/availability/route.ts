import { ok, err, dbErr } from '@/lib/api/http'
import { createClient } from '@/lib/supabase/server'
import { checkApiKey, clampWindowHours, validateBookingDate, validatePartySize } from '@/lib/api/publicGuard'
import { NextResponse } from 'next/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

/**
 * Public availability check — no auth required.
 * Used by external booking forms to show available time slots.
 *
 * GET /api/public/availability
 *   ?venue_slug=STRING
 *   &date=YYYY-MM-DD          (local date at the venue)
 *   &party_size=NUMBER
 *   &duration_minutes=NUMBER  (default: venue's default_duration_minutes)
 *   &window_hours=NUMBER      (how many hours to scan, default 8)
 */
export async function GET(req: Request) {
  const keyErr = checkApiKey(req)
  if (keyErr) return keyErr

  const url = new URL(req.url)
  const venueSlug = url.searchParams.get('venue_slug')
  const date = url.searchParams.get('date')
  const partySize = Number(url.searchParams.get('party_size') ?? '2')
  const windowHours = clampWindowHours(Number(url.searchParams.get('window_hours') ?? '8'))

  if (!venueSlug) return err('venue_slug is required', { status: 400, headers: CORS })
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('date is required (YYYY-MM-DD)', { status: 400, headers: CORS })

  const partySizeErr = validatePartySize(partySize)
  if (partySizeErr) return partySizeErr

  const supabase = await createClient()

  // Resolve venue
  const { data: venue, error: venueErr } = await supabase
    .from('venues')
    .select('id, name, venue_settings(booking_enabled, default_duration_minutes, min_notice_minutes, max_advance_booking_days, max_party_size)')
    .eq('slug', venueSlug)
    .eq('is_active', true)
    .single()

  if (venueErr || !venue) return err(`Venue '${venueSlug}' not found`, { status: 404, headers: CORS })

  const settings = (venue.venue_settings as unknown as {
    booking_enabled: boolean
    default_duration_minutes: number
    min_notice_minutes: number
    max_advance_booking_days: number
    max_party_size: number
  } | null)

  if (!settings?.booking_enabled) return err('Venue is not accepting bookings', { status: 422, headers: CORS })
  if (partySize > (settings.max_party_size ?? 999)) {
    return err(`Party size exceeds venue maximum (${settings.max_party_size})`, { status: 422, headers: CORS })
  }

  const dateErr = validateBookingDate(date, settings.max_advance_booking_days ?? 90)
  if (dateErr) return dateErr

  const durationMinutes = Number(url.searchParams.get('duration_minutes') ?? settings.default_duration_minutes ?? 120)
  const duration = `${Math.floor(durationMinutes / 60)}:${String(durationMinutes % 60).padStart(2, '0')}:00`

  // Search window: from midnight of the requested date for window_hours hours
  const searchStart = new Date(`${date}T00:00:00`)
  const searchEnd = new Date(`${date}T00:00:00`)
  searchEnd.setHours(searchEnd.getHours() + windowHours)

  const { data: slots, error: slotsErr } = await supabase.rpc('get_free_time_slots_for_venue', {
    p_venue_id: venue.id,
    p_search_start: searchStart.toISOString(),
    p_search_end: searchEnd.toISOString(),
    p_duration: duration,
  })

  if (slotsErr) return dbErr(slotsErr, 'get_free_time_slots_for_venue')

  // Verify each slot actually has capacity for the party
  const verified: { starts_at: string; ends_at: string }[] = []
  for (const slot of slots ?? []) {
    const { data: match } = await supabase.rpc('get_available_single_table_matches', {
      p_venue_id: venue.id,
      p_table_type_id: null,
      p_starts_at: slot.slot_start,
      p_ends_at: slot.slot_end,
      p_party_size: partySize,
      p_area: null,
    })
    if (match && match.length > 0) {
      verified.push({ starts_at: slot.slot_start, ends_at: slot.slot_end })
    } else {
      // Try combination
      const { data: combo } = await supabase.rpc('find_best_table_combination', {
        p_venue_id: venue.id,
        p_table_type_id: null,
        p_starts_at: slot.slot_start,
        p_ends_at: slot.slot_end,
        p_party_size: partySize,
        p_area: null,
      })
      if (combo && combo.length > 0) {
        verified.push({ starts_at: slot.slot_start, ends_at: slot.slot_end })
      }
    }
  }

  return ok({
    venue_id: venue.id,
    venue_name: venue.name,
    date,
    party_size: partySize,
    duration_minutes: durationMinutes,
    slots: verified,
  }, { headers: CORS })
}
