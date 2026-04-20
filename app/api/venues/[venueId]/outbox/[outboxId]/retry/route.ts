import { ok, err, dbErr } from '@/lib/api/http'
import { requireSuperAdmin } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ venueId: string; outboxId: string }> }

export async function POST(_req: Request, { params }: Params) {
  const { venueId, outboxId } = await params
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const supabase = createAdminClient()

  // Verify the outbox event belongs to this venue
  const { data: event, error: evErr } = await supabase
    .from('integration_outbox')
    .select('id, venue_id, status')
    .eq('id', outboxId)
    .eq('venue_id', venueId)
    .single()

  if (evErr || !event) return err('Not found', { status: 404 })
  if (event.status !== 'failed') return err('Only failed events can be retried', { status: 400 })

  const { error } = await supabase.rpc('retry_outbox_event', {
    p_outbox_id: Number(outboxId),
  })

  if (error) return dbErr(error, 'retry_outbox_event')
  return ok({ success: true })
}
