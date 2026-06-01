import { createAdminClient } from '@/lib/supabase/server'
import { enqueueNotification } from './enqueue'
import type { NotificationKind } from './types'

// Convenience helper: load a reservation + its customer + venue, then enqueue
// a notification on whatever channel was selected at booking time.  Used for
// status-change events (cancellation, modification, etc.) where we don't
// already have the full payload in scope.
//
// Returns the outbox row id on success, null when there's nothing to send
// (no channel chosen, or contact info missing).  Never throws — caller can
// fire-and-forget without try/catch.
export async function enqueueReservationNotification(
  reservationId: number,
  kind: NotificationKind,
): Promise<number | null> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('reservations')
      .select(`
        id, starts_at, ends_at, party_size, notification_channel,
        customer:customer_id (full_name, email, phone),
        venue:assigned_venue_id (name, logo_url, address, phone, website, email_contact, timezone),
        requested_venue:requested_venue_id (name, logo_url, address, phone, website, email_contact, timezone)
      `)
      .eq('id', reservationId)
      .single()

    if (error || !data) {
      console.error(`[enqueueReservationNotification ${reservationId}] fetch failed:`, error?.message)
      return null
    }

    const channel = (data as { notification_channel: 'email' | 'sms' | null }).notification_channel
    if (!channel) return null

    const customer = data.customer as unknown as {
      full_name: string | null
      email: string | null
      phone: string | null
    } | null

    const toAddress = channel === 'email' ? customer?.email : customer?.phone
    if (!toAddress) return null

    type VenueRow = {
      name: string
      logo_url: string | null
      address: string | null
      phone: string | null
      website: string | null
      email_contact: string | null
      timezone: string | null
    }
    const venue = ((data.venue ?? data.requested_venue) as unknown as VenueRow | null)

    return await enqueueNotification({
      reservationId,
      channel,
      kind,
      toAddress,
      payload: {
        customerName: customer?.full_name ?? 'Guest',
        customerEmail: customer?.email ?? null,
        customerPhone: customer?.phone ?? null,
        venue: {
          name: venue?.name ?? '',
          logoUrl: venue?.logo_url ?? null,
          address: venue?.address ?? null,
          phone: venue?.phone ?? null,
          website: venue?.website ?? null,
          emailContact: venue?.email_contact ?? null,
          timezone: venue?.timezone ?? null,
        },
        startsAt: data.starts_at as string,
        endsAt: data.ends_at as string,
        partySize: data.party_size as number,
        reservationId,
      },
    })
  } catch (e) {
    console.error(`[enqueueReservationNotification ${reservationId}] threw:`, e)
    return null
  }
}
