import { resend, EMAIL_FROM } from './client'
import { formatDateYYYYMMDD, formatTimeRange } from '@/lib/datetime/businessTime'

export interface ConfirmationEmailData {
  to: string
  customerName: string
  venueName: string
  startsAt: string
  endsAt: string
  partySize: number
  reservationId: string | number
  isReassignment?: boolean
  customerServiceNote?: string
}

export async function sendConfirmationEmail(data: ConfirmationEmailData): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] Skipping — RESEND_API_KEY not configured')
    return false
  }

  const {
    to, customerName, venueName, startsAt, endsAt,
    partySize, reservationId, isReassignment = false, customerServiceNote,
  } = data

  const date = formatDateYYYYMMDD(startsAt)
  const time = formatTimeRange(startsAt, endsAt)

  const subject = isReassignment
    ? `Your reservation has been updated — ${venueName}`
    : `Reservation confirmed — ${venueName}`

  const noteBlock = customerServiceNote
    ? `<div style="border-left:3px solid #6366f1;padding-left:16px;margin-bottom:24px;">
         <p style="color:#374151;font-size:14px;margin:0;">${customerServiceNote}</p>
       </div>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;margin:0;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#18181b;padding:24px 32px;">
      <p style="color:#a1a1aa;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em;">Legjobbkocsma</p>
      <h1 style="color:#fff;font-size:20px;margin:0;font-weight:600;">
        ${isReassignment ? 'Your reservation has been updated' : 'Reservation confirmed'}
      </h1>
    </div>

    <div style="padding:32px;">
      <p style="color:#374151;font-size:15px;margin:0 0 24px;line-height:1.6;">
        Hi <strong>${customerName}</strong>,<br><br>
        ${isReassignment
          ? `We've made an update to your reservation at <strong>${venueName}</strong>. Please see the new details below.`
          : `Your reservation at <strong>${venueName}</strong> has been confirmed.`
        }
      </p>

      <div style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding-bottom:12px;">Venue</td>
            <td style="color:#111827;font-size:14px;font-weight:600;text-align:right;padding-bottom:12px;">${venueName}</td>
          </tr>
          <tr>
            <td style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding-bottom:12px;">Date</td>
            <td style="color:#111827;font-size:14px;font-weight:600;text-align:right;padding-bottom:12px;">${date}</td>
          </tr>
          <tr>
            <td style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding-bottom:12px;">Time</td>
            <td style="color:#111827;font-size:14px;font-weight:600;text-align:right;padding-bottom:12px;">${time}</td>
          </tr>
          <tr>
            <td style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">Party size</td>
            <td style="color:#111827;font-size:14px;font-weight:600;text-align:right;">${partySize} ${partySize === 1 ? 'guest' : 'guests'}</td>
          </tr>
        </table>
      </div>

      ${noteBlock}

      <p style="color:#9ca3af;font-size:11px;margin:0;">Reservation #${reservationId}</p>
    </div>
  </div>
</body>
</html>`

  try {
    await resend.emails.send({ from: EMAIL_FROM, to, subject, html })
    console.log(`[email] Confirmation sent to ${to} (reservation #${reservationId})`)
    return true
  } catch (err) {
    // Non-fatal: log but don't throw — reservation is already confirmed
    console.error('[email] Failed to send confirmation:', err)
    return false
  }
}
