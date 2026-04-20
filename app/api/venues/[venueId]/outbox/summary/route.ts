import { ok, dbErr } from '@/lib/api/http'
import { requireSuperAdmin } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'
import type { OutboxProviderSummary } from '@/lib/types/outbox'

type Params = { params: Promise<{ venueId: string }> }

type SummaryRow = {
  venue_id: string
  provider: string
  status: string
  event_count: number
  oldest_created_at: string | null
}

function aggregateRows(rows: SummaryRow[]): OutboxProviderSummary[] {
  const byProvider = new Map<string, OutboxProviderSummary>()
  for (const row of rows) {
    if (!byProvider.has(row.provider)) {
      byProvider.set(row.provider, {
        provider: row.provider,
        pending: 0,
        delivering: 0,
        delivered: 0,
        failed: 0,
        skipped: 0,
      })
    }
    const summary = byProvider.get(row.provider)!
    const key = row.status as keyof Omit<OutboxProviderSummary, 'provider'>
    if (key in summary) summary[key] = row.event_count
  }
  return Array.from(byProvider.values())
}

export async function GET(_req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_outbox_summary', {
    p_venue_id: Number(venueId),
  })

  if (error) return dbErr(error, 'get_outbox_summary')
  return ok({ data: aggregateRows((data ?? []) as SummaryRow[]) })
}
