import { after } from 'next/server'
import { ok, err, dbErr } from '@/lib/api/http'
import { requireSupportOrAbove } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'
import { drainOne } from '@/lib/notifications/drain'

type Params = { params: Promise<{ id: string }> }

// Force-retry a failed/dead outbox row.  Resets attempts and next_attempt_at
// so the next drainOne call picks it up immediately.  Triggers an after()
// drain so the user sees feedback in seconds, not on the next cron tick.
export async function POST(_req: Request, { params }: Params) {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const { id } = await params
  const rowId = Number(id)
  if (!Number.isFinite(rowId)) return err('Invalid id', { status: 400 })

  const admin = createAdminClient()

  // Only resettable from a terminal-ish state — never override a row
  // that's in 'sending' (a worker is on it) or already 'sent'.
  const { data, error } = await admin
    .from('notification_outbox')
    .update({
      status: 'pending',
      attempts: 0,
      last_error: null,
      next_attempt_at: new Date().toISOString(),
    })
    .eq('id', rowId)
    .in('status', ['failed', 'dead'])
    .select('id')
    .maybeSingle()

  if (error) return dbErr(error)
  if (!data) return err('Cannot retry — row already sent or in flight', { status: 409 })

  after(() => drainOne(rowId))

  return ok({ retried: true })
}
