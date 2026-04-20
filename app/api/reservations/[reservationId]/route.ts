import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireAuth, requireSupportOrAbove } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'
import { canAccessVenue } from '@/lib/auth/getSession'
import { UpdateReservationSchema } from '@/lib/validators/reservations'
import { sendConfirmationEmail } from '@/lib/email/sendConfirmation'
import type { UserSession } from '@/lib/auth/getSession'

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

type Params = { params: Promise<{ reservationId: string }> }

async function getAndCheckAccess(
  reservationId: string,
  session: UserSession,
) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('reservations')
    .select('id, requested_venue_id, status')
    .eq('id', reservationId)
    .single()

  if (error || !data) return null
  if (!canAccessVenue(session, data.requested_venue_id)) return null
  return data
}

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { reservationId } = await params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('reservations')
    .select(RESERVATION_SELECT)
    .eq('id', reservationId)
    .single()

  if (error) return dbErr(error)

  if (!canAccessVenue(auth.session, data.requested_venue_id)) {
    return err('Forbidden', { status: 403 })
  }

  return ok({ data })
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { reservationId } = await params
  const reservation = await getAndCheckAccess(reservationId, auth.session)
  if (!reservation) return err('Not found or forbidden', { status: 404 })

  const body = await safeJson(req)
  const parsed = UpdateReservationSchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }

  const supabase = createAdminClient()
  const { status, cancel_note, ...rest } = parsed.data

  if (status === 'cancelled') {
    const { error } = await supabase.rpc('cancel_reservation', {
      p_reservation_id: Number(reservationId),
      p_note: cancel_note ?? null,
    })
    if (error) return dbErr(error, 'cancel_reservation')
  } else if (status === 'completed') {
    const { error } = await supabase.rpc('mark_reservation_completed', {
      p_reservation_id: Number(reservationId),
    })
    if (error) return dbErr(error, 'mark_reservation_completed')
  } else if (status === 'no_show') {
    const { error } = await supabase.rpc('mark_reservation_no_show', {
      p_reservation_id: Number(reservationId),
    })
    if (error) return dbErr(error, 'mark_reservation_no_show')
  } else {
    const hasFieldEdit = (
      rest.customer_full_name !== undefined ||
      rest.customer_phone !== undefined ||
      rest.customer_email !== undefined ||
      rest.party_size !== undefined ||
      rest.starts_at !== undefined ||
      rest.ends_at !== undefined
    )

    if (hasFieldEdit) {
      const { error } = await supabase.rpc('update_reservation_fields', {
        p_reservation_id:    Number(reservationId),
        p_customer_full_name: rest.customer_full_name ?? null,
        p_customer_phone:     rest.customer_phone ?? null,
        p_customer_email:     rest.customer_email ?? null,
        p_party_size:         rest.party_size ?? null,
        p_special_requests:   rest.special_requests ?? null,
        p_internal_notes:     rest.internal_notes ?? null,
        p_starts_at:          rest.starts_at ?? null,
        p_ends_at:            rest.ends_at ?? null,
      })
      if (error) return dbErr(error, 'update_reservation_fields')
    } else {
      const updates: Record<string, unknown> = {}
      if (rest.internal_notes !== undefined) updates.internal_notes = rest.internal_notes
      if (rest.special_requests !== undefined) updates.special_requests = rest.special_requests

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('reservations')
          .update(updates)
          .eq('id', reservationId)
        if (error) return dbErr(error)
      }
    }
  }

  return ok({ success: true })
}

export async function POST(req: Request, { params }: Params) {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  if (action === 'confirm_email') {
    const auth = await requireAuth()
    if (!auth.ok) return auth.response

    const { reservationId } = await params
    const reservation = await getAndCheckAccess(reservationId, auth.session)
    if (!reservation) return err('Not found or forbidden', { status: 404 })

    const supabase = createAdminClient()

    // Fetch full reservation details to send the email
    const { data: full } = await supabase
      .from('reservations')
      .select('starts_at, ends_at, party_size, customers(full_name, email), assigned_venue:assigned_venue_id(name), requested_venue:requested_venue_id(name)')
      .eq('id', reservationId)
      .single()

    const customer = full?.customers as unknown as { full_name: string | null; email: string | null } | null
    const venue = (full?.assigned_venue ?? full?.requested_venue) as unknown as { name: string } | null

    if (customer?.email && full) {
      const sent = await sendConfirmationEmail({
        to: customer.email,
        customerName: customer.full_name ?? 'Guest',
        venueName: venue?.name ?? '',
        startsAt: full.starts_at,
        endsAt: full.ends_at,
        partySize: full.party_size,
        reservationId,
      })

      if (sent) {
        const { error } = await supabase.rpc('mark_confirmation_email_sent', {
          p_reservation_id: Number(reservationId),
          p_mode: 'manual',
        })
        if (error) return dbErr(error, 'mark_confirmation_email_sent')
      }
    }
    return ok({ success: true })
  }

  if (action === 'revert_cancellation') {
    const auth = await requireSupportOrAbove()
    if (!auth.ok) return auth.response

    const { reservationId } = await params
    const reservation = await getAndCheckAccess(reservationId, auth.session)
    if (!reservation) return err('Not found or forbidden', { status: 404 })

    if (reservation.status !== 'cancelled') {
      return err('Reservation is not cancelled', { status: 409 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase.rpc('revert_reservation_cancellation', {
      p_reservation_id: Number(reservationId),
    })
    if (error) return dbErr(error, 'revert_reservation_cancellation')
    return ok({ success: true })
  }

  return err('Unknown action', { status: 400 })
}
