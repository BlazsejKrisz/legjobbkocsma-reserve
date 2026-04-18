import { ok, err, safeJson } from '@/lib/api/http'
import { createClient } from '@/lib/supabase/server'
import { PartnerReservationSchema } from '@/lib/validators/reservations'
import { addMinutes } from 'date-fns'

/**
 * Public partner booking endpoint.
 * Called by partner websites / third-party aggregators.
 * Auth: per-partner API key in X-Api-Key header.
 */
export async function POST(req: Request) {
  // Authenticate partner
  const apiKey = req.headers.get('X-Api-Key')
  if (!apiKey) return err('Missing X-Api-Key', { status: 401 })

  const supabase = await createClient()

  const { data: keyRow, error: keyErr } = await supabase
    .from('partner_api_keys')
    .select('id, venue_id, is_active')
    .eq('key_hash', apiKey) // store hashed keys in prod; simplest match here
    .single()

  if (keyErr || !keyRow) return err('Invalid API key', { status: 401 })
  if (!keyRow.is_active) return err('API key is disabled', { status: 403 })

  const body = await safeJson(req)
  const parsed = PartnerReservationSchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }

  const payload = parsed.data

  // Resolve venue_slug → venue_id
  const { data: venue, error: venueErr } = await supabase
    .from('venues')
    .select('id, is_active')
    .eq('slug', payload.venue_slug)
    .single()

  if (venueErr || !venue) return err(`Venue '${payload.venue_slug}' not found`, { status: 404 })
  if (!venue.is_active) return err('Venue is not accepting bookings', { status: 422 })

  // Resolve optional table_type_code → table_type_id (table_types is global, not per-venue)
  let tableTypeId: string | null = null
  if (payload.table_type_code) {
    const { data: tt } = await supabase
      .from('table_types')
      .select('id')
      .eq('code', payload.table_type_code)
      .single()
    tableTypeId = tt?.id ?? null
  }

  // Calculate ends_at
  const startsAt = new Date(payload.starts_at)
  const endsAt = addMinutes(startsAt, payload.duration_minutes ?? 120)

  // Get or create customer
  const { data: customerId, error: custErr } = await supabase.rpc('get_or_create_customer', {
    p_full_name: payload.customer.full_name,
    p_email: payload.customer.email ?? null,
    p_phone: payload.customer.phone ?? null,
  })
  if (custErr) return err(custErr.message, { status: 500 })

  // Create reservation via auto-assign RPC
  const durationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000)

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

  if (rpcErr) return err(rpcErr.message, { status: 500 })

  // A pending_manual_review result is still a success — reservation is accepted
  return ok({
    reservation_id: result?.reservation_id ?? null,
    status: result?.status ?? 'pending_manual_review',
    overflow_reason: result?.overflow_reason ?? null,
  }, { status: 201 })
}
