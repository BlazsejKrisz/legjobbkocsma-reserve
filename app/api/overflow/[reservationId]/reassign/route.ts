import { after } from 'next/server'
import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireSupportOrAbove } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'
import { canAccessVenue } from '@/lib/auth/getSession'
import { ReassignReservationSchema } from '@/lib/validators/reservations'
import { enqueueNotification } from '@/lib/notifications/enqueue'
import { drainOne } from '@/lib/notifications/drain'

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

  if (new_table_ids && new_table_ids.length > 0) {
    const { data: tables } = await supabase
      .from('tables')
      .select('venue_id')
      .in('id', new_table_ids)
    if (!tables?.every((t) => String(t.venue_id) === String(new_venue_id))) {
      return err('One or more tables do not belong to the target venue', { status: 422 })
    }
  }

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
      .select('starts_at, ends_at, party_size, customers(full_name, email, phone), assigned_venue:assigned_venue_id(name, logo_url, address, phone, website, email_contact)')
      .eq('id', reservationId)
      .single()

    const customer = full?.customers as unknown as { full_name: string | null; email: string | null; phone: string | null } | null
    const assignedVenue = full?.assigned_venue as unknown as { name: string; logo_url: string | null; address: string | null; phone: string | null; website: string | null; email_contact: string | null } | null

    if (customer?.email) {
      try {
        // First-time confirmation vs reconfirmation:
        //  • Overflow row (pending_manual_review) being approved → the
        //    guest is hearing "your reservation is confirmed" for the
        //    first time.  Use kind='confirmation'.
        //  • Already-confirmed row being moved (different table/time/
        //    venue) → the guest already knew about the booking, so this
        //    is "modified and reconfirmed".  Use kind='updated'.
        const wasOverflow = res.status === 'pending_manual_review'
        const kind = wasOverflow ? 'confirmation' : 'updated'

        const outboxId = await enqueueNotification({
          reservationId: Number(reservationId),
          channel: 'email',
          kind,
          toAddress: customer.email,
          payload: {
            customerName: customer.full_name ?? 'Guest',
            customerEmail: customer.email ?? null,
            customerPhone: customer.phone ?? null,
            venue: {
              name: assignedVenue?.name ?? '',
              logoUrl: assignedVenue?.logo_url ?? null,
              address: assignedVenue?.address ?? null,
              phone: assignedVenue?.phone ?? null,
              website: assignedVenue?.website ?? null,
              emailContact: assignedVenue?.email_contact ?? null,
            },
            startsAt: full!.starts_at,
            endsAt: full!.ends_at,
            partySize: full!.party_size,
            reservationId,
            // Only flag as a reassignment when the row was already
            // confirmed before — the customer already knew about it,
            // and this email tells them what changed.
            isReassignment: !wasOverflow,
            customerServiceNote: parsed.data.customer_service_note,
          },
        })

        await supabase.rpc('mark_confirmation_email_sent', {
          p_reservation_id: Number(reservationId),
          p_mode: 'manual',
          // The reassign dialog only triggers email today (the
          // send_confirmation_email checkbox).  When SMS is plumbed
          // through this dialog, change to the actual channel.
          p_channel: 'email',
        })

        after(() => drainOne(outboxId))
      } catch (e) {
        console.error('[reassign] enqueue failed:', e)
      }
    }
  }

  return ok({ data })
}
