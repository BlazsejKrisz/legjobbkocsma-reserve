import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireSupportOrAbove } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'
import { canAccessVenue } from '@/lib/auth/getSession'
import { ReassignReservationSchema } from '@/lib/validators/reservations'
import { sendConfirmationEmail } from '@/lib/email/sendConfirmation'

type Params = { params: Promise<{ reservationId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const { reservationId } = await params
  const supabase = createAdminClient()

  const { data: res, error: resError } = await supabase
    .from('reservations')
    .select('id, requested_venue_id')
    .eq('id', reservationId)
    .single()

  if (resError || !res) return err('Not found', { status: 404 })
  if (!canAccessVenue(auth.session, res.requested_venue_id)) return err('Forbidden', { status: 403 })

  const { data, error } = await supabase.rpc('get_reallocation_options', {
    p_reservation_id: Number(reservationId),
  })

  if (error) return dbErr(error, 'get_reallocation_options')
  return ok({ data: data ?? [] })
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const { reservationId } = await params
  const supabase = createAdminClient()

  const { data: res, error: resError } = await supabase
    .from('reservations')
    .select('id, requested_venue_id, status')
    .eq('id', reservationId)
    .single()

  if (resError || !res) return err('Not found', { status: 404 })
  if (!canAccessVenue(auth.session, res.requested_venue_id)) return err('Forbidden', { status: 403 })
  if (res.status === 'cancelled') {
    return err('Cannot reassign a cancelled reservation', { status: 409 })
  }

  const body = await safeJson(req)
  const parsed = ReassignReservationSchema.safeParse(body)
  if (!parsed.success) {
    console.error('[reassign_reservation] invalid payload', JSON.stringify({
      body,
      errors: parsed.error.flatten(),
    }))
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }

  const { new_table_ids, new_venue_id, new_starts_at, customer_service_note, send_confirmation_email } =
    parsed.data

  const { data, error } = await supabase.rpc('reassign_reservation', {
    p_reservation_id: Number(reservationId),
    p_new_table_ids: new_table_ids,
    p_new_venue_id: new_venue_id,
    p_new_starts_at: new_starts_at,
    p_customer_service_notes: customer_service_note ?? null,
    p_send_manual_confirmation: send_confirmation_email,
  })

  if (error) return dbErr(error, 'reassign_reservation')

  // Send confirmation email if requested
  if (send_confirmation_email) {
    const { data: full } = await supabase
      .from('reservations')
      .select('starts_at, ends_at, party_size, customers(full_name, email), assigned_venue:assigned_venue_id(name)')
      .eq('id', reservationId)
      .single()

    const customer = full?.customers as unknown as { full_name: string | null; email: string | null } | null
    const assignedVenue = full?.assigned_venue as unknown as { name: string } | null

    if (customer?.email) {
      const sent = await sendConfirmationEmail({
        to: customer.email,
        customerName: customer.full_name ?? 'Guest',
        venueName: assignedVenue?.name ?? '',
        startsAt: full!.starts_at,
        endsAt: full!.ends_at,
        partySize: full!.party_size,
        reservationId,
        isReassignment: true,
        customerServiceNote: parsed.data.customer_service_note,
      })

      if (sent) {
        await supabase.rpc('mark_confirmation_email_sent', {
          p_reservation_id: Number(reservationId),
          p_mode: 'manual',
        })
      }
    }
  }

  return ok({ data })
}
