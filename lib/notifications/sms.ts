import { formatDateYYYYMMDD, formatTimeRange } from '@/lib/datetime/businessTime'
import type { NotificationKind, NotificationPayload, SendResult } from './types'

// SMS templates — HU only (multi-language doubles segments → doubles cost).
// Use ASCII-fold (no accents) so the message fits GSM-7 encoding (160 chars
// per segment) instead of UCS-2 (70 chars) — single segment vs double.
function smsTemplate(kind: NotificationKind, payload: NotificationPayload): string {
  const date = formatDateYYYYMMDD(payload.startsAt)
  const time = formatTimeRange(payload.startsAt, payload.endsAt)
  const venue = asciiFold(payload.venue.name)
  const pax = payload.partySize
  const replyTo = payload.venue.phone ?? payload.venue.emailContact ?? ''
  const replySuffix = replyTo ? ` Lemondas: ${replyTo}` : ''

  switch (kind) {
    case 'confirmation':
      return `Foglalas visszaigazolva: ${venue}, ${date} ${time}, ${pax} fo.${replySuffix}`
    case 'received':
      return `Koszonjuk a foglalasi igenyet! (${venue}, ${date} ${time}, ${pax} fo) Hamarosan visszaigazoljuk.`
    case 'updated':
      return `Foglalasa modositva: ${venue}, ${date} ${time}, ${pax} fo.${replySuffix}`
    case 'reminder':
      return `Emlekezteto: ${venue} ${date} ${time}, ${pax} fo.${replySuffix}`
    case 'cancellation':
      return `Foglalasa lemondva: ${venue}, ${date} ${time}.`
  }
}

// GSM-7 doesn't include á, é, í, ó, ö, ő, ú, ü, ű — fold them to ASCII so
// we stay in single-segment territory.  Loses some readability, doubles the
// per-message cost if we don't.
function asciiFold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ő/g, 'o').replace(/Ő/g, 'O')
    .replace(/ű/g, 'u').replace(/Ű/g, 'U')
}

// SeeMe.hu wants the number without the leading `+` (e.g. "36201234567").
// libphonenumber-js gives us "+36201234567".  Strip it at the boundary.
function toSeemeNumber(e164: string): string {
  return e164.replace(/^\+/, '')
}

// Provider abstraction.  Today: SeeMe.hu.  Future: Twilio, Vonage — drop a
// new file in lib/notifications/providers/ and switch on SMS_PROVIDER.
export async function sendSms(
  to: string,
  kind: NotificationKind,
  payload: NotificationPayload,
  outboxId: number,
): Promise<SendResult> {
  const apiKey = process.env.SEEME_API_KEY
  const sender = process.env.SEEME_FROM
  const gatewayUrl = process.env.SEEME_GATEWAY_URL ?? 'https://seeme.hu/gateway'
  const callbackUrl = process.env.SMS_CALLBACK_URL  // e.g. https://yourdomain.com/api/webhooks/sms-delivery

  if (!apiKey) {
    return { ok: false, transient: false, error: 'SEEME_API_KEY not configured' }
  }
  if (!sender) {
    return { ok: false, transient: false, error: 'SEEME_FROM not configured' }
  }

  const message = smsTemplate(kind, payload)
  const number = toSeemeNumber(to)

  const params = new URLSearchParams({
    key: apiKey,
    sender,
    number,
    message,
    format: 'json',
    reference: `notif-${outboxId}`,    // echoed in DLR callback → correlate to outbox row
    callback: '1,5,6,7',                // delivered + all failure codes
    ...(callbackUrl ? { callbackurl: callbackUrl } : {}),
  })

  try {
    const res = await fetch(`${gatewayUrl}?${params.toString()}`, {
      method: 'GET',
    })

    if (!res.ok) {
      // HTTP-level failure (gateway unreachable, 5xx).  Treat as transient.
      return {
        ok: false,
        transient: true,
        error: `SeeMe HTTP ${res.status}`,
      }
    }

    const body = (await res.json()) as {
      result?: 'OK' | 'ERR'
      code?: number
      message?: string
    }

    if (body.result === 'OK' && body.code === 0) {
      return { ok: true, providerId: `notif-${outboxId}` }
    }

    // SeeMe send-time response codes (NB: these are different from the DLR
    // callback codes used by the webhook — same numbers, different meaning).
    //
    // Fatal (won't fix on retry):
    //   1  missing required parameter         → bug in our code
    //   2  non-numeric in numeric field       → bug in our code
    //   3  phone not in international format  → bad input
    //   4  invalid API auth                   → config
    //   5  gateway settings incomplete        → config (account)
    //   6  message exceeds 459 chars          → bug in template
    //   9  sender ID illegal/unauthorized     → config
    //   12 unsupported characters             → encoding mismatch
    //   13 IP not authorized                  → config
    //   15 callback param malformed           → bug in our code
    //   16 length exceeds encoding limit      → bug in template
    //   18 API key invalid                    → config
    //
    // Transient (worth retrying):
    //   7  insufficient balance               → top up may happen
    //   8  gateway temporarily unavailable
    //   11 postpaid credit insufficient
    //   17 callback URL unreachable           → our infra hiccup
    const fatal = new Set([1, 2, 3, 4, 5, 6, 9, 12, 13, 15, 16, 18])
    const transient = !fatal.has(body.code ?? -1)
    return {
      ok: false,
      transient,
      error: `SeeMe send code ${body.code}: ${body.message ?? 'unknown'}`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, transient: true, error: message }
  }
}
