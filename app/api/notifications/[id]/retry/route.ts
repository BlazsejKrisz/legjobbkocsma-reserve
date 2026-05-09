import { after } from 'next/server'
import { ok, err, dbErr } from '@/lib/api/http'
import { requireSupportOrAbove } from '@/lib/api/authz'
import { canAccessVenue } from '@/lib/auth/getSession'
import { createAdminClient } from '@/lib/supabase/server'
import { drainOne } from '@/lib/notifications/drain'

type Params = { params: Promise<{ id: string }> }

// Force-retry a failed/dead outbox row.  Resets attempts and next_attempt_at
// so the next drainOne call picks it up immediately.  Triggers an after()
// drain so the user sees feedback in seconds, not on the next cron tick.
//
// Venue scope is enforced even at the support tier: the row's reservation
// must belong to a venue the caller can access.  Super-admins bypass.
export async function POST(_req: Request, { params }: Params) {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const { id } = await params
  const rowId = Number(id)
  if (!Number.isFinite(rowId)) return err('Invalid id', { status: 400 })

  const admin = createAdminClient()

  // Verify caller has access to the reservation's venue before any
  // mutation.  Without this, support users could re-trigger emails for
  // tenants they shouldn't operate on.
  const { data: row, error: rowErr } = await admin
    .from('notification_outbox')
    .select(`
      id, status, channel,
      reservation:reservation_id (id, requested_venue_id, assigned_venue_id)
    `)
    .eq('id', rowId)
    .maybeSingle()
  if (rowErr) return dbErr(rowErr, 'notification_outbox_lookup')
  if (!row) return err('Not found', { status: 404 })

  const reservation = row.reservation as unknown as {
    requested_venue_id: number | null
    assigned_venue_id: number | null
  } | null
  const venueId = reservation?.assigned_venue_id ?? reservation?.requested_venue_id ?? null
  if (venueId !== null && !canAccessVenue(auth.session, venueId)) {
    return err('Forbidden', { status: 403 })
  }

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
