import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireSuperAdmin } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { ReorderTablesSchema } from '@/lib/validators/tables'

type Params = { params: Promise<{ venueId: string }> }

export async function POST(req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = ReorderTablesSchema.safeParse(body)
  if (!parsed.success) return err('Invalid payload', { status: 400, details: parsed.error.flatten() })

  const supabase = await createClient()
  const order = parsed.data.order

  // Phase 1: shift all sort_orders to large temporary values to avoid the
  // unique (venue_id, sort_order) constraint firing mid-update when values swap.
  const OFFSET = 1_000_000
  const phase1 = order.map(({ id, sort_order }) =>
    supabase
      .from('tables')
      .update({ sort_order: sort_order + OFFSET })
      .eq('id', id)
      .eq('venue_id', venueId),
  )
  const r1 = await Promise.all(phase1)
  const fail1 = r1.find((r) => r.error)
  if (fail1?.error) return dbErr(fail1.error, 'reorder phase 1')

  // Phase 2: set final sort_order values
  const phase2 = order.map(({ id, sort_order }) =>
    supabase
      .from('tables')
      .update({ sort_order })
      .eq('id', id)
      .eq('venue_id', venueId),
  )
  const r2 = await Promise.all(phase2)
  const fail2 = r2.find((r) => r.error)
  if (fail2?.error) return dbErr(fail2.error, 'reorder phase 2')

  return ok({ success: true })
}
