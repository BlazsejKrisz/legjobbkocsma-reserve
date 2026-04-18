import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireAuth } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { CreateReservationSchema } from '@/lib/validators/reservations'
import { canAccessVenue } from '@/lib/auth/getSession'
import { sendConfirmationEmail } from '@/lib/email/sendConfirmation'

const RESERVATION_SELECT = `
  id, requested_venue_id, assigned_venue_id, customer_id,
  starts_at, ends_at, party_size, status, source, overflow_reason,
  special_requests, internal_notes,
  auto_confirmation_email_sent_at, manual_confirmation_email_sent_at,
  created_at,
  customers (id, full_name, email, phone, created_at),
  requested_venue:requested_venue_id (id, name),
  assigned_venue:assigned_venue_id (id, name),
  reservation_tables (
    id, reservation_id, table_id, released_at,
    tables (id, name, area, capacity_min, capacity_max)
  )
`

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const venueId = url.searchParams.get('venue_id') ?? undefined
  const status = url.searchParams.get('status') ?? undefined
  const source = url.searchParams.get('source') ?? undefined
  const dateFrom = url.searchParams.get('date_from') ?? undefined
  const dateTo = url.searchParams.get('date_to') ?? undefined
  const search = url.searchParams.get('search') ?? undefined
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Math.min(Number(url.searchParams.get('page_size') ?? '50'), 100)

  const supabase = await createClient()

  let query = supabase
    .from('reservations')
    .select(RESERVATION_SELECT, { count: 'exact' })
    .order('starts_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (auth.session.isVenueStaff && auth.session.venueIds.length > 0) {
    query = query.in('requested_venue_id', auth.session.venueIds)
  }
  if (venueId) query = query.eq('requested_venue_id', venueId)
  if (status) query = query.eq('status', status)
  if (source) query = query.eq('source', source)
  if (dateFrom) query = query.gte('starts_at', dateFrom)
  if (dateTo) query = query.lte('starts_at', dateTo)
  if (search) {
    query = query.or(
      `customers.full_name.ilike.%${search}%,customers.email.ilike.%${search}%,customers.phone.ilike.%${search}%`,
    )
  }

  const { data, error, count } = await query
  if (error) return dbErr(error)

  return ok({ data: data ?? [], count: count ?? 0, page, pageSize })
}

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = CreateReservationSchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }

  const payload = parsed.data

  if (!canAccessVenue(auth.session, payload.venue_id)) {
    return err('Forbidden', { status: 403 })
  }

  const supabase = await createClient()

  // get_or_create_customer requires at least email or phone
  if (!payload.customer_email && !payload.customer_phone) {
    return err('Customer email or phone is required', { status: 400 })
  }

  const { data: customer, error: customerError } = await supabase.rpc(
    'get_or_create_customer',
    {
      p_full_name: payload.customer_full_name ?? null,
      p_email: payload.customer_email ?? null,
      p_phone: payload.customer_phone ?? null,
    },
  )
  if (customerError) return dbErr(customerError, 'get_or_create_customer')
  const customerId = customer as number

  const durationMinutes = Math.round(
    (new Date(payload.ends_at).getTime() - new Date(payload.starts_at).getTime()) / 60_000,
  )

  const { data: rpcResult, error: rpcError } = await supabase.rpc('create_reservation_auto', {
    p_requested_venue_id: payload.venue_id,
    p_customer_id: customerId,
    p_source: payload.source,
    p_requested_table_type_id: payload.requested_table_type_id ?? null,
    p_starts_at: payload.starts_at,
    p_party_size: payload.party_size,
    p_duration_minutes: durationMinutes,
    p_area: payload.area ?? null,
    p_special_requests: payload.special_requests ?? null,
    p_internal_notes: payload.internal_notes ?? null,
  })

  if (rpcError) return dbErr(rpcError, 'create_reservation_auto')

  // Send confirmation email if auto-confirmed and customer has email
  if (rpcResult?.status === 'confirmed' && payload.customer_email) {
    const { data: venue } = await supabase
      .from('venues')
      .select('name')
      .eq('id', payload.venue_id)
      .single()

    await sendConfirmationEmail({
      to: payload.customer_email,
      customerName: payload.customer_full_name ?? 'Guest',
      venueName: venue?.name ?? '',
      startsAt: payload.starts_at,
      endsAt: payload.ends_at,
      partySize: payload.party_size,
      reservationId: rpcResult.reservation_id,
    })

    await supabase.rpc('mark_confirmation_email_sent', {
      p_reservation_id: Number(rpcResult.reservation_id),
      p_mode: 'auto',
    })
  }

  return ok({ data: rpcResult }, { status: 201 })
}
