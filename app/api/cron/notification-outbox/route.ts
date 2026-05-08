import { ok, err } from '@/lib/api/http'
import { drainDue } from '@/lib/notifications/drain'

// Sweeper for the notification outbox.  Runs every 1 minute as a safety
// net for messages that the after() fast-path didn't deliver — e.g. when
// a function instance was recycled mid-send, or transient provider failures
// that need backoff retries.
//
// Most invocations see 0 due rows.  That's fine — query is indexed.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return err('Unauthorized', { status: 401 })
  }

  const { drained } = await drainDue(50)

  if (drained > 0) {
    console.log(`[cron/notification-outbox] drained ${drained} notification(s)`)
  }
  return ok({ drained })
}
