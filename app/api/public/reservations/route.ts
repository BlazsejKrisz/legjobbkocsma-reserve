import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { createAdminClient } from '@/lib/supabase/server'
import { PartnerReservationSchema } from '@/lib/validators/reservations'
import { sendConfirmationEmail } from '@/lib/email/sendConfirmation'
import { checkApiKey, validateBookingDate, validatePartySize } from '@/lib/api/publicGuard'
import { addMinutes } from 'date-fns'
import { NextResponse } from 'next/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

/**
 * Public reservation submission — no auth required.
 * Used by external booking forms (WordPress, etc.) to create reservations.
 *
 * POST /api/public/reservations
 * Body: PartnerReservationSchema
 */
export async function POST(req: Request) {
  const keyErr = checkApiKey(req)
  if (keyErr) {
    const body = await keyErr.json() as { error: string }
    return err(body.error, { status: keyErr.status, headers: CORS })
  }

  const body = await safeJson(req)
  const parsed = PartnerReservationSchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.issues, headers: CORS })
  }

  const payload = parsed.data

  const partySizeErr = validatePartySize(payload.party_size)
  if (partySizeErr) return err('party_size must be between 1 and 500', { status: 400, headers: CORS })

  const supabase = createAdminClient()

  // Resolve venue by slug
  const { data: venue, error: venueErr } = await supabase
    .from('venues')
    .select(`
      id, name,
      venue_settings (
        booking_enabled,
        default_duration_minutes,
        max_party_size,
        max_advance_booking_days
      )
    `)
    .eq('slug', payload.venue_slug)
    .eq('is_active', true)
    .single()

  if (venueErr || !venue) return err(`Venue '${payload.venue_slug}' not found`, { status: 404, headers: CORS })

  const settings = venue.venue_settings as unknown as {
    booking_enabled: boolean
    default_duration_minutes: number
    max_party_size: number
    max_advance_booking_days: number
  } | null

  if (!settings?.booking_enabled) {
    return err('Venue is not accepting bookings', { status: 422, headers: CORS })
  }
  if (payload.party_size > (settings.max_party_size ?? 999)) {
    return err(`Party size exceeds venue maximum (${settings.max_party_size})`, { status: 422, headers: CORS })
  }

  const dateErr = validateBookingDate(
    payload.starts_at.slice(0, 10),
    settings.max_advance_booking_days ?? 90,
  )
  if (dateErr) {
    const body = await dateErr.json() as { error: string }
    return err(body.error, { status: dateErr.status, headers: CORS })
  }

  // Resolve table type if code was given
  let tableTypeId: number | null = null
  if (payload.table_type_code) {
    const { data: tt } = await supabase
      .from('table_types')
      .select('id')
      .eq('code', payload.table_type_code)
      .eq('is_active', true)
      .single()
    if (tt) tableTypeId = tt.id
  }

  // Compute ends_at
  const startsAt = new Date(payload.starts_at)
  const durationMinutes = payload.duration_minutes ?? settings.default_duration_minutes ?? 120
  const endsAt = addMinutes(startsAt, durationMinutes)

  // Upsert customer
  const { data: customer, error: customerErr } = await supabase.rpc('get_or_create_customer', {
    p_full_name: payload.customer.full_name,
    p_email: payload.customer.email ?? null,
    p_phone: payload.customer.phone ?? null,
  })
  if (customerErr) return dbErr(customerErr, 'get_or_create_customer')
  const customerId = customer as number

  // Create reservation via the same RPC used internally
  const { data: rpcResult, error: rpcError } = await supabase.rpc('create_reservation_auto', {
    p_requested_venue_id: venue.id,
    p_customer_id: customerId,
    p_source: 'partner',
    p_requested_table_type_id: tableTypeId,
    p_starts_at: startsAt.toISOString(),
    p_party_size: payload.party_size,
    p_duration_minutes: durationMinutes,
    p_area: payload.area ?? null,
    p_special_requests: payload.message ?? null,
    p_internal_notes: null,
  })

  if (rpcError) return dbErr(rpcError, 'create_reservation_auto')

  // Send confirmation email if auto-confirmed and customer has email
  if (rpcResult?.status === 'confirmed' && payload.customer.email) {
    const sent = await sendConfirmationEmail({
      to: payload.customer.email,
      customerName: payload.customer.full_name,
      venueName: venue.name,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      partySize: payload.party_size,
      reservationId: rpcResult.reservation_id,
    })

    if (sent) {
      await supabase.rpc('mark_confirmation_email_sent', {
        p_reservation_id: Number(rpcResult.reservation_id),
        p_mode: 'auto',
      })
    }
  }

  return ok({
    reservation_id: rpcResult?.reservation_id,
    status: rpcResult?.status,
    venue_id: venue.id,
    venue_name: venue.name,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    party_size: payload.party_size,
  }, { status: 201, headers: CORS })
}
