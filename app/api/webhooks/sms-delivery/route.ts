import { timingSafeEqual } from 'node:crypto'
import { ok, err } from '@/lib/api/http'
import { createAdminClient } from '@/lib/supabase/server'

// SeeMe.hu delivery callback (DLR).
//
// SeeMe sends GET requests to this URL with query parameters when an SMS
// changes delivery state.  We use the `reference` param (we set it to
// `notif-<outbox_id>` at send time) to find the corresponding row and
// update its terminal status.
//
// Status code reference (from SeeMe docs):
//   1, 5, 7  → undeliverable / failed
//   3, 4     → in flight (intermediate, ignored)
//   6        → delivered
//
// Security: SeeMe doesn't sign callbacks.  We layer two gates:
//
//   1. A shared-secret token in the URL query (`?secret=…`) that we
//      configured into the SeeMe callback URL when registering it.
//      Without this an attacker who guesses an outbox id can flip rows
//      to `dead` via the failure code path — silencing customer comms.
//   2. Optional IP allow-list for the SeeMe edge (80.249.169.123) when
//      `SMS_CALLBACK_REQUIRE_IP=1`.  Defence-in-depth, not the primary
//      auth — `x-forwarded-for` can be spoofed before reaching Vercel.
//
// We never accept a transition that would silence a previously-confirmed
// failure (`dead → delivered`); the status flow is one-way to terminal.
const SEEME_CALLBACK_IP = '80.249.169.123'

function checkCallbackSecret(req: Request): boolean {
  const expected = process.env.SMS_CALLBACK_SECRET
  if (!expected) return true  // gate disabled — local dev only, document this
  const url = new URL(req.url)
  const provided = url.searchParams.get('secret') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function GET(req: Request) {
  if (!checkCallbackSecret(req)) {
    return err('Forbidden', { status: 403 })
  }

  // Best-effort source check.  Behind Vercel's proxy, x-forwarded-for is
  // the only real source IP signal.  In dev / staging this won't match;
  // gate the strict check behind an env var.
  if (process.env.SMS_CALLBACK_REQUIRE_IP === '1') {
    const xff = req.headers.get('x-forwarded-for') ?? ''
    const sourceIp = xff.split(',')[0]?.trim() ?? ''
    if (sourceIp !== SEEME_CALLBACK_IP) {
      return err('Forbidden', { status: 403 })
    }
  }

  const url = new URL(req.url)
  const reference = url.searchParams.get('reference')
  const codeStr = url.searchParams.get('code')
  const message = url.searchParams.get('message')
  const price = url.searchParams.get('price')

  // SeeMe pings the URL when saving in their dashboard to verify reachability.
  // Return 200 OK for empty / validation requests so the URL gets accepted.
  if (!reference || !codeStr) {
    return ok({ healthy: true })
  }

  // Reference is "notif-<id>".  Anything else isn't ours; don't 500.
  const match = reference.match(/^notif-(\d+)$/)
  if (!match) return ok({ ignored: true })
  const outboxId = Number(match[1])
  const code = Number(codeStr)

  // Only act on terminal states.  Intermediate codes (3, 4) just mean
  // the message is in flight; we already marked the row 'sent' when SeeMe
  // accepted the send request.  No reason to flap status back.
  const DELIVERED = 6
  const FAILED = new Set([1, 5, 7])

  const admin = createAdminClient()

  if (code === DELIVERED) {
    // Already 'sent' — record actual delivery cost in last_error field as
    // a quick win for observability without adding a column.  When chunk 4
    // adds the dashboard, we can promote this to a structured column.
    await admin
      .from('notification_outbox')
      .update({
        last_error: price ? `delivered (${price} HUF)` : 'delivered',
      })
      .eq('id', outboxId)
      .eq('channel', 'sms')
    return ok({ updated: 'delivered' })
  }

  if (FAILED.has(code)) {
    // Forward-only state transition: only flip to `dead` from non-terminal
    // statuses we'd expect a DLR to update.  Do NOT allow `delivered →
    // dead` (which would silence a confirmed delivery), and require the
    // row exist as an SMS to keep accidental cross-channel updates out.
    await admin
      .from('notification_outbox')
      .update({
        status: 'dead',
        last_error: `delivery failed (code ${code}): ${message ?? 'unknown'}`,
      })
      .eq('id', outboxId)
      .eq('channel', 'sms')
      .in('status', ['pending', 'sending', 'sent', 'failed'])
    return ok({ updated: 'failed' })
  }

  // Intermediate code — ignored.
  return ok({ ignored: true, code })
}
