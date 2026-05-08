import React from 'react'
import { render } from '@react-email/render'
import { resend, buildFromHeader } from '@/lib/email/client'
import { ReservationEmail } from '@/lib/email/ReservationEmail'
import { formatDateYYYYMMDD, formatTimeRange } from '@/lib/datetime/businessTime'
import type { NotificationKind, NotificationPayload, SendResult } from './types'

// Map an outbox kind → ReservationEmail's `type` prop.  Reminders and
// cancellations land here in chunk 4; for now they fall back to the
// confirmation/updated layout.
function templateTypeFor(kind: NotificationKind): 'confirmed' | 'received' | 'updated' | 'cancelled' {
  switch (kind) {
    case 'confirmation': return 'confirmed'
    case 'received':     return 'received'
    case 'updated':      return 'updated'
    case 'reminder':     return 'confirmed'   // reminder reuses the confirmation layout
    case 'cancellation': return 'cancelled'
  }
}

function subjectFor(kind: NotificationKind, venueName: string): string {
  switch (kind) {
    case 'confirmation':  return `Foglalás visszaigazolva — ${venueName}`
    case 'received':      return `Foglalási igény beérkezett — ${venueName}`
    case 'updated':       return `Foglalás módosítva és megerősítve — ${venueName}`
    case 'reminder':      return `Emlékeztető — ${venueName}`
    case 'cancellation':  return `Foglalás lemondva — ${venueName}`
  }
}

export async function sendEmail(
  to: string,
  kind: NotificationKind,
  payload: NotificationPayload,
  outboxId: number,
): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, transient: false, error: 'RESEND_API_KEY not configured' }
  }

  const html = await render(
    React.createElement(ReservationEmail, {
      type: templateTypeFor(kind),
      venue: payload.venue,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      customerPhone: payload.customerPhone,
      date: formatDateYYYYMMDD(payload.startsAt),
      time: formatTimeRange(payload.startsAt, payload.endsAt),
      partySize: payload.partySize,
      reservationId: payload.reservationId,
      customerServiceNote: payload.customerServiceNote,
    }),
  )

  try {
    // Idempotency-Key prevents duplicate sends when after() and the cron
    // race for the same row.  Resend honours this header for 24h.
    const { data, error } = await resend.emails.send(
      {
        from: buildFromHeader(payload.venue.name),
        to,
        subject: subjectFor(kind, payload.venue.name),
        html,
        ...(payload.venue.emailContact ? { replyTo: payload.venue.emailContact } : {}),
      },
      { idempotencyKey: `notif-${outboxId}` },
    )

    if (error) {
      // Resend's typed error.  4xx → config issue (bad API key, unverified
      // domain, blocked recipient).  5xx / network → transient.
      const status = (error as { statusCode?: number }).statusCode ?? 0
      const transient = status === 0 || status >= 500 || status === 429
      return { ok: false, transient, error: error.message }
    }

    return { ok: true, providerId: data?.id }
  } catch (err) {
    // Network / fetch failure — treat as transient.
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, transient: true, error: message }
  }
}
