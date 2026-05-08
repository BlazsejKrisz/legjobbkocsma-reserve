import { after } from 'next/server'
import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireAuth, requireSupportOrAbove } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'
import { canAccessVenue } from '@/lib/auth/getSession'
import { UpdateReservationSchema } from '@/lib/validators/reservations'
import { enqueueNotification } from '@/lib/notifications/enqueue'
import { drainOne } from '@/lib/notifications/drain'
import { z } from 'zod'
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
      .select('starts_at, ends_at, party_size, customers(full_name, email), assigned_venue:assigned_venue_id(name, logo_url, address, phone, website, email_contact), requested_venue:requested_venue_id(name, logo_url, address, phone, website, email_contact)')
      .eq('id', reservationId)
      .single()

    const customer = full?.customers as unknown as { full_name: string | null; email: string | null } | null
    type VenueRow = { name: string; logo_url: string | null; address: string | null; phone: string | null; website: string | null; email_contact: string | null }
    const venueRow = (full?.assigned_venue ?? full?.requested_venue) as unknown as VenueRow | null

    if (customer?.email && full) {
      try {
        const outboxId = await enqueueNotification({
          reservationId: Number(reservationId),
          channel: 'email',
          kind: 'confirmation',
          toAddress: customer.email,
          payload: {
            customerName: customer.full_name ?? 'Guest',
            venue: {
              name: venueRow?.name ?? '',
              logoUrl: venueRow?.logo_url ?? null,
              address: venueRow?.address ?? null,
              phone: venueRow?.phone ?? null,
              website: venueRow?.website ?? null,
              emailContact: venueRow?.email_contact ?? null,
            },
            startsAt: full.starts_at,
            endsAt: full.ends_at,
            partySize: full.party_size,
            reservationId,
          },
        })

        // Mark sent_at synchronously so the UI hides the "Confirm + email"
        // button immediately, even before the email actually delivers.
        // The cron will retry the send if it fails.
        const { error } = await supabase.rpc('mark_confirmation_email_sent', {
          p_reservation_id: Number(reservationId),
          p_mode: 'manual',
        })
        if (error) return dbErr(error, 'mark_confirmation_email_sent')

        after(() => drainOne(outboxId))
      } catch (e) {
        console.error('[reservation confirm_email] enqueue failed:', e)
        return err('Failed to queue email', { status: 500 })
      }
    }
    return ok({ success: true })
  }

  if (action === 'change_tables') {
    const auth = await requireAuth()
    if (!auth.ok) return auth.response

    const { reservationId } = await params
    const supabase = createAdminClient()

    const { data: res, error: resErr } = await supabase
      .from('reservations')
      .select('id, requested_venue_id, assigned_venue_id, starts_at, status')
      .eq('id', reservationId)
      .single()

    if (resErr || !res) return err('Not found', { status: 404 })
    if (!canAccessVenue(auth.session, res.requested_venue_id)) return err('Forbidden', { status: 403 })
    if (res.status !== 'confirmed') return err('Only confirmed reservations can change tables', { status: 409 })
    if (!res.assigned_venue_id) return err('Reservation has no assigned venue', { status: 409 })

    const body = await safeJson(req)
    const changeTablesSchema = z.object({ new_table_ids: z.array(z.number().int().positive()).min(1) })
    const changeParsed = changeTablesSchema.safeParse(body)
    if (!changeParsed.success) return err('new_table_ids is required', { status: 400 })
    const { new_table_ids } = changeParsed.data

    const { data: tables } = await supabase
      .from('tables')
      .select('venue_id')
      .in('id', new_table_ids)
    if (!tables?.every((t) => String(t.venue_id) === String(res.assigned_venue_id))) {
      return err('One or more tables do not belong to the assigned venue', { status: 422 })
    }

    const { error } = await supabase.rpc('reassign_reservation', {
      p_reservation_id: Number(reservationId),
      p_new_table_ids: new_table_ids,
      p_new_venue_id: res.assigned_venue_id,
      p_new_starts_at: res.starts_at,
      p_customer_service_notes: null,
      p_send_manual_confirmation: false,
    })
    if (error) return dbErr(error, 'reassign_reservation')
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
