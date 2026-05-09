import { ok } from '@/lib/api/http'
import { checkCronAuth } from '@/lib/api/cronAuth'
import { drainDue } from '@/lib/notifications/drain'
import { createAdminClient } from '@/lib/supabase/server'

// Sweeper for the notification outbox.  Runs every 1 minute as a safety
// net for messages that the after() fast-path didn't deliver — e.g. when
// a function instance was recycled mid-send, or transient provider failures
// that need backoff retries.
//
// Most invocations see 0 due rows.  That's fine — query is indexed.
export async function GET(req: Request) {
  const cronErr = checkCronAuth(req)
  if (cronErr) return cronErr

  // Recover any rows a previous worker started sending but never
  // confirmed (cold start kill, network partition).  Cheap when there
  // are zero stuck rows; the partial index covers the lookup.
  //
  // The sweep RPC ships in migration 040.  If it's not deployed yet
  // we log once and continue — drain still works, just without the
  // crashed-worker recovery layer.
  const admin = createAdminClient()
  const { data: revived, error: sweepErr } = await admin.rpc('sweep_stuck_notification_outbox')
  if (sweepErr) {
    console.warn('[cron/notification-outbox] sweep skipped:', sweepErr.message)
  } else if (revived && revived > 0) {
    console.warn(`[cron/notification-outbox] recovered ${revived} stuck-sending row(s)`)
  }

  const { drained } = await drainDue(50)

  if (drained > 0) {
    console.log(`[cron/notification-outbox] drained ${drained} notification(s)`)
  }
  return ok({ drained, revived: revived ?? 0 })
}
