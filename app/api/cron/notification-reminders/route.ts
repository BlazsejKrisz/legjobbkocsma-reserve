import { ok, err } from '@/lib/api/http'
import { checkCronAuth } from '@/lib/api/cronAuth'
import { createAdminClient } from '@/lib/supabase/server'
import { enqueueNotification } from '@/lib/notifications/enqueue'
import { drainDue } from '@/lib/notifications/drain'
import { redactEmail, redactPhone } from '@/lib/log/redact'

// T-2h reminder cron.
//
// Runs every 30 minutes and picks up confirmed reservations whose start
// time falls in the next 1.5–2.5h window.  Each match becomes a
// 'reminder' kind notification on the channel the customer originally
// chose (email or sms), then we stamp reminder_sent_at so the next tick
// doesn't double-send.
//
// Same-day bookings made less than 1.5h before start get no reminder —
// the confirmation is recent enough.  The 1-hour window means the
// effective reminder lands somewhere between 1.5h and 2.5h ahead.
//
// Why a 1-hour window for a 30-minute cron: belt and suspenders.  If a
// cron run is skipped for any reason, the next one still picks up rows
// that aged into the window.  reminder_sent_at prevents duplicate sends.
type ReservationRow = {
  id: number
  starts_at: string
  ends_at: string
  party_size: number
  notification_channel: 'email' | 'sms'
  customer: {
    full_name: string | null
    email: string | null
    phone: string | null
  } | null
  venue: {
    id: number
    name: string
    logo_url: string | null
    address: string | null
    phone: string | null
    website: string | null
    email_contact: string | null
  } | null
}

export async function GET(req: Request) {
  const cronErr = checkCronAuth(req)
  if (cronErr) return cronErr

  const supabase = createAdminClient()

  // 1.5–2.5h ahead.  Bounds computed in JS so we always compare absolute
  // instants and avoid any timezone confusion in Postgres.
  const now = Date.now()
  const lo = new Date(now + 1.5 * 60 * 60 * 1000).toISOString()
  const hi = new Date(now + 2.5 * 60 * 60 * 1000).toISOString()

  // Atomic claim: stamp reminder_sent_at AND return the rows in one
  // statement.  If two cron instances overlap (cold start, slow drain,
  // accidental double-schedule), only one wins each row — the other gets
  // an empty result.  Without this, both sides would pass the
  // `is(null)` filter and both would enqueue a reminder.
  const claimedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('reservations')
    .update({ reminder_sent_at: claimedAt })
    .eq('status', 'confirmed')
    .not('notification_channel', 'is', null)
    .is('reminder_sent_at', null)
    .gte('starts_at', lo)
    .lte('starts_at', hi)
    .select(`
      id, starts_at, ends_at, party_size, notification_channel,
      customer:customer_id (full_name, email, phone),
      venue:assigned_venue_id (id, name, logo_url, address, phone, website, email_contact)
    `)
    .limit(200)

  if (error) {
    console.error('[cron/reminders] claim failed:', error.message)
    return err('claim failed', { status: 500 })
  }

  const rows = (data ?? []) as unknown as ReservationRow[]
  let queued = 0
  let skipped = 0
  // Reservation IDs whose claim we want to roll back because we couldn't
  // enqueue (e.g. missing channel / venue / contact info, or enqueue
  // throw).  Without rollback, the row would never be retried.
  const releaseIds: number[] = []

  for (const r of rows) {
    if (!r.notification_channel || !r.venue) {
      skipped++
      releaseIds.push(r.id)
      continue
    }

    const toAddress =
      r.notification_channel === 'email' ? r.customer?.email : r.customer?.phone
    if (!toAddress) {
      // Channel was set but contact info has been removed — defensive skip.
      // Release the claim so a future tick can retry once contact info is
      // restored (otherwise the row is stuck "reminded" forever).
      skipped++
      releaseIds.push(r.id)
      continue
    }

    try {
      await enqueueNotification({
        reservationId: r.id,
        channel: r.notification_channel,
        kind: 'reminder',
        toAddress,
        payload: {
          customerName: r.customer?.full_name ?? 'Guest',
          customerEmail: r.customer?.email ?? null,
          customerPhone: r.customer?.phone ?? null,
          venue: {
            name: r.venue.name,
            logoUrl: r.venue.logo_url,
            address: r.venue.address,
            phone: r.venue.phone,
            website: r.venue.website,
            emailContact: r.venue.email_contact,
          },
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          partySize: r.party_size,
          reservationId: r.id,
        },
      })

      // Claim already stamped — no second update needed.
      queued++
    } catch (e) {
      const recipient = r.notification_channel === 'email'
        ? redactEmail(r.customer?.email)
        : redactPhone(r.customer?.phone)
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[cron/reminders] enqueue failed for reservation ${r.id} (to=${recipient}): ${msg}`)
      // Roll back the claim so the next tick can retry.
      releaseIds.push(r.id)
    }
  }

  if (releaseIds.length > 0) {
    const { error: releaseErr } = await supabase
      .from('reservations')
      .update({ reminder_sent_at: null })
      .in('id', releaseIds)
      .eq('reminder_sent_at', claimedAt) // only undo our own claim
    if (releaseErr) {
      console.error('[cron/reminders] release failed:', releaseErr.message)
    }
  }

  // Drain whatever we just queued so the customer sees the SMS/email in
  // the next minute, not after the next outbox cron tick.
  if (queued > 0) {
    await drainDue(queued)
  }

  if (queued > 0 || skipped > 0) {
    console.log(`[cron/reminders] queued ${queued}, skipped ${skipped}, total candidates ${rows.length}`)
  }

  return ok({ queued, skipped, candidates: rows.length })
}
