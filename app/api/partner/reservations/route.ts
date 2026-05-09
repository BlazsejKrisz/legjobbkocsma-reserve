import { timingSafeEqual, createHash } from 'node:crypto'
import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { createAdminClient } from '@/lib/supabase/server'
import { PartnerReservationSchema } from '@/lib/validators/reservations'
import { addMinutes } from 'date-fns'
import { validateBookingDate, validatePartySize } from '@/lib/api/publicGuard'
import { checkIpRateLimit, checkEmailRateLimit } from '@/lib/api/rateLimiter'

function getIp(req: Request): string {
  const fwd = req.headers.get('x-vercel-forwarded-for') ?? req.headers.get('x-forwarded-for')
  return fwd?.split(',')[0]?.trim() ?? 'unknown'
}

// Constant-time match between the candidate hash and the stored hash for
// the row we looked up.  PostgREST already filtered by hash equality, but
// we keep this as a defensive layer in case the row is fetched some
// other way later.
function hashMatches(provided: string, stored: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(stored)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Public partner booking endpoint.
 * Called by partner websites / third-party aggregators.
 * Auth: per-partner API key in X-Api-Key header.
 *
 * Layered defences identical to /api/public/reservations:
 *   1. Edge rate limit (per IP, in proxy.ts).
 *   2. API key gate (sha256 hash compare, constant-time).
 *   3. Per-IP route limit + per-email limit (Upstash, sliding window).
 *   4. Schema validation (Zod).
 *   5. Hard caps on party size + booking date.
 *
 * Without these the partner endpoint was the unprotected back door —
 * a leaked partner key let any browser POST without a single rate limit.
 */
export async function POST(req: Request) {
  // 1. API key — must be present and non-empty
  const apiKey = req.headers.get('X-Api-Key')
  if (!apiKey || apiKey.length < 16) return err('Missing X-Api-Key', { status: 401 })

  const supabase = createAdminClient()

  // 2. Look up by hash.  partner_api_keys.key_hash is sha256 hex(32 bytes).
  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  const { data: keyRow, error: keyErr } = await supabase
    .from('partner_api_keys')
    .select('id, venue_id, is_active, key_hash')
    .eq('key_hash', keyHash)
    .single()

  // Same generic error for not-found and disabled — don't reveal which.
  if (keyErr || !keyRow || !keyRow.is_active) {
    return err('Invalid API key', { status: 401 })
  }
  if (!hashMatches(keyHash, keyRow.key_hash)) {
    return err('Invalid API key', { status: 401 })
  }

  // 3. Per-IP and per-email rate limiting.  Edge limiter caught the easy
  //    burst; this catches the slow drip-feed and per-customer abuse.
  const ip = getIp(req)
  if (!(await checkIpRateLimit(ip))) {
    return err('too_many_requests', { status: 429 })
  }

  const body = await safeJson(req)
  const parsed = PartnerReservationSchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }

  const payload = parsed.data

  if (payload.customer.email) {
    if (!(await checkEmailRateLimit(payload.customer.email))) {
      return err('too_many_requests', { status: 429 })
    }
  }

  // 4. Hard caps.  Party size capped at MAX_PARTY_SIZE regardless of venue
  //    settings; the RPC routes oversized parties to overflow itself.
  const partySizeErr = validatePartySize(payload.party_size)
  if (partySizeErr) return partySizeErr

  // 5. Resolve venue + check key↔venue binding.  Use is_active filter at
  //    the SQL level so a disabled venue doesn't leak its existence via a
  //    distinct error message.
  const { data: venue, error: venueErr } = await supabase
    .from('venues')
    .select('id, is_active, venue_settings(max_advance_booking_days, booking_enabled)')
    .eq('slug', payload.venue_slug)
    .eq('is_active', true)
    .single()

  if (venueErr || !venue) {
    return err('Venue not found or not accepting bookings', { status: 404 })
  }
  if (venue.id !== keyRow.venue_id) {
    return err('API key not authorized for this venue', { status: 403 })
  }

  const settings = venue.venue_settings as unknown as {
    max_advance_booking_days: number | null
    booking_enabled: boolean
  } | null
  if (!settings?.booking_enabled) {
    return err('Venue is not accepting bookings', { status: 422 })
  }

  // 6. Date sanity — same window the embed enforces.
  const dateErr = validateBookingDate(
    payload.starts_at.slice(0, 10),
    settings.max_advance_booking_days ?? 90,
  )
  if (dateErr) return dateErr

  // 7. Resolve optional table_type_code → table_type_id (global table)
  let tableTypeId: number | null = null
  if (payload.table_type_code) {
    const { data: tt } = await supabase
      .from('table_types')
      .select('id')
      .eq('code', payload.table_type_code)
      .eq('is_active', true)
      .single()
    tableTypeId = tt?.id ?? null
  }

  // 8. Compute ends_at
  const startsAt = new Date(payload.starts_at)
  const endsAt = addMinutes(startsAt, payload.duration_minutes ?? 120)
  const durationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000)

  // 9. Get or create customer
  const { data: customerId, error: custErr } = await supabase.rpc('get_or_create_customer', {
    p_full_name: payload.customer.full_name,
    p_email: payload.customer.email ?? null,
    p_phone: payload.customer.phone ?? null,
  })
  if (custErr) return dbErr(custErr, 'get_or_create_customer')

  // 10. Create reservation via auto-assign RPC
  const { data: result, error: rpcErr } = await supabase.rpc('create_reservation_auto', {
    p_requested_venue_id: venue.id,
    p_customer_id: customerId,
    p_source: 'partner',
    p_requested_table_type_id: tableTypeId,
    p_starts_at: payload.starts_at,
    p_party_size: payload.party_size,
    p_duration_minutes: durationMinutes,
    p_area: payload.area ?? null,
    p_special_requests: payload.message ?? null,
    p_internal_notes: null,
  })

  if (rpcErr) return dbErr(rpcErr, 'create_reservation_auto')

  return ok({
    reservation_id: result?.reservation_id ?? null,
    status: result?.status ?? 'pending_manual_review',
    overflow_reason: result?.overflow_reason ?? null,
  }, { status: 201 })
}
