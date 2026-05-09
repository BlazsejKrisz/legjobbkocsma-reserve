import { after } from 'next/server'
import { ok, err, dbErr } from '@/lib/api/http'
import { requireSupportOrAbove } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'
import { canAccessVenue } from '@/lib/auth/getSession'
import { enqueueNotification } from '@/lib/notifications/enqueue'
import { drainOne } from '@/lib/notifications/drain'
import { defaultChannel, resolveChannel } from '@/lib/notifications/channel'
import { toE164 } from '@/lib/phone/parse'

type Params = { params: Promise<{ reservationId: string }> }

type AvailabilityRow = {
  match_type: string
  table_ids: number[]
  combined: boolean
  capacity_min: number
  capacity_max: number
  starts_at: string
  ends_at: string
}

// Quick-accept an overflow reservation that now fits at its originally
// requested slot.  This is the "the badge says it fits — please just
// confirm it" workflow: support clicks Save, the system re-runs the
// availability check, picks the first 'requested' match, calls
// reassign_reservation against the original venue+time with the matched
// table(s), and sends the appropriate confirmation notification.
//
// Pre-conditions enforced:
//   * Reservation exists, status = 'pending_manual_review'
//   * Caller has venue access for the requested venue
//   * Re-running find_availability_with_alternatives still returns a
//     'requested' row (capacity may have evaporated between badge render
//     and click — we re-check rather than trust the stale UI state).
//
// Post:
//   * Reservation moves to 'confirmed' status, table(s) attached
//   * Confirmation notification (email/sms based on the row's
//     notification_channel; falls back to whatever contact info exists)
//   * mark_confirmation_email_sent stamps the row so the cron + UI
//     don't double-send
export async function POST(_req: Request, { params }: Params) {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const { reservationId } = await params
  const supabase = createAdminClient()

  // 1. Load reservation + customer info.  We need contact details and
  //    the chosen notification_channel to decide how to notify.
  const { data: res, error: resError } = await supabase
    .from('reservations')
    .select(`
      id, requested_venue_id, status, party_size, starts_at, ends_at,
      notification_channel,
      customer:customer_id (full_name, email, phone),
      requested_venue:requested_venue_id (id, name, logo_url, address, phone, website, email_contact)
    `)
    .eq('id', reservationId)
    .single()

  if (resError || !res) return err('Not found', { status: 404 })
  if (!canAccessVenue(auth.session, res.requested_venue_id)) {
    return err('Forbidden', { status: 403 })
  }
  if (res.status !== 'pending_manual_review') {
    return err('Reservation is not in the overflow queue', { status: 409 })
  }

  // 2. Re-run availability check at the original requested slot.  If
  //    capacity disappeared between badge render and click, fall back
  //    to a clear error so support knows to use the full reassignment
  //    dialog instead.
  const duration = Math.round(
    (new Date(res.ends_at).getTime() - new Date(res.starts_at).getTime()) / 60_000,
  )
  const { data: matches, error: availErr } = await supabase.rpc(
    'find_availability_with_alternatives',
    {
      p_venue_id: res.requested_venue_id,
      p_starts_at: res.starts_at,
      p_duration_minutes: duration,
      p_party_size: res.party_size,
      p_alt_time_window_minutes: 0,
      p_alt_time_step_minutes: 30,
    },
  )
  if (availErr) return dbErr(availErr, 'find_availability_with_alternatives')

  const requestedMatch = (matches as AvailabilityRow[] | null)?.find(
    (m) => m.match_type === 'requested',
  )
  if (!requestedMatch || !requestedMatch.table_ids?.length) {
    return err(
      'No longer fits at the requested time. Use full reassignment instead.',
      { status: 422 },
    )
  }

  // 3. Reassign — keeps the original venue + time, only attaches the
  //    matched table(s).  reassign_reservation flips status from
  //    pending_manual_review to confirmed atomically.
  const { error: reassignErr } = await supabase.rpc('reassign_reservation', {
    p_reservation_id: Number(reservationId),
    p_new_table_ids: requestedMatch.table_ids,
    p_new_venue_id: res.requested_venue_id,
    p_new_starts_at: res.starts_at,
    p_customer_service_notes: null,
    p_send_manual_confirmation: false,
  })
  if (reassignErr) return dbErr(reassignErr, 'reassign_reservation')

  // 4. Send the confirmation notification.  Use the channel that was
  //    chosen at booking time (most likely 'email' for embed-source
  //    overflow rows); fall back to whatever contact info the customer
  //    has on file.
  const customer = res.customer as unknown as {
    full_name: string | null
    email: string | null
    phone: string | null
  } | null
  const venue = res.requested_venue as unknown as {
    name: string | null
    logo_url: string | null
    address: string | null
    phone: string | null
    website: string | null
    email_contact: string | null
  } | null

  const phoneE164 = customer?.phone ? toE164(customer.phone) : null
  const stored = (res.notification_channel as 'email' | 'sms' | 'none' | null) ?? null
  const desired = stored ?? defaultChannel({
    hasEmail: !!customer?.email,
    hasPhone: !!phoneE164,
  })
  const channel = resolveChannel({
    desired,
    hasEmail: !!customer?.email,
    hasPhone: !!phoneE164,
  })

  if (channel !== 'none') {
    const toAddress = channel === 'email' ? customer!.email! : phoneE164!
    try {
      const outboxId = await enqueueNotification({
        reservationId: Number(reservationId),
        channel,
        kind: 'confirmation',
        toAddress,
        payload: {
          customerName: customer?.full_name ?? 'Guest',
          customerEmail: customer?.email ?? null,
          customerPhone: phoneE164,
          venue: {
            name: venue?.name ?? '',
            logoUrl: venue?.logo_url ?? null,
            address: venue?.address ?? null,
            phone: venue?.phone ?? null,
            website: venue?.website ?? null,
            emailContact: venue?.email_contact ?? null,
          },
          startsAt: res.starts_at,
          endsAt: res.ends_at,
          partySize: res.party_size,
          reservationId: Number(reservationId),
        },
      })

      // Stamp the row so cron + UI know the email was already sent.
      await supabase.rpc('mark_confirmation_email_sent', {
        p_reservation_id: Number(reservationId),
        p_mode: 'manual',
        p_channel: channel,
      })

      // Drain after the response so the customer sees the email/SMS
      // arrive in seconds, not on the next cron tick.
      after(() => drainOne(outboxId))
    } catch (e) {
      // Enqueue failure is non-fatal — the reassignment already succeeded.
      // Log so ops can see it and manually trigger if needed.
      console.error('[overflow/quick-accept] enqueue failed:', e)
    }
  }

  return ok({
    accepted: true,
    table_ids: requestedMatch.table_ids,
    notification_channel: channel,
  })
}
