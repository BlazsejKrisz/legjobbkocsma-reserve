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
// Security: SeeMe doesn't sign callbacks.  We restrict to their callback IP
// (80.249.169.123 per the dashboard) — this is a soft guard since the only
// effect of a forged callback is updating an outbox row's status to a
// less-pessimistic state, which doesn't trigger any further action.
const SEEME_CALLBACK_IP = '80.249.169.123'

export async function GET(req: Request) {
  // Best-effort source check.  Behind Vercel's proxy, x-forwarded-for is
  // the only real source IP signal.  In dev / staging this won't match;
  // gate the strict check behind an env var.
  if (process.env.SMS_CALLBACK_REQUIRE_IP === '1') {
    const xff = req.headers.get('x-forwarded-for') ?? ''
    const sourceIp = xff.split(',')[0].trim()
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
    await admin
      .from('notification_outbox')
      .update({
        status: 'dead',
        last_error: `delivery failed (code ${code}): ${message ?? 'unknown'}`,
      })
      .eq('id', outboxId)
      .eq('channel', 'sms')
    return ok({ updated: 'failed' })
  }

  // Intermediate code — ignored.
  return ok({ ignored: true, code })
}
