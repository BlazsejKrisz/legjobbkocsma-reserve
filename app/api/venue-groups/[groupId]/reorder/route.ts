import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireSuperAdmin } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'

type Params = { params: Promise<{ groupId: string }> }

const ReorderSchema = z.object({
  ordered_venue_ids: z.array(z.coerce.number().int().positive()).min(1),
})

export async function POST(req: Request, { params }: Params) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { groupId } = await params
  const body = await safeJson(req)
  const parsed = ReorderSchema.safeParse(body)
  if (!parsed.success) return err('Invalid payload', { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.rpc('reorder_group_members', {
    p_group_id: Number(groupId),
    p_ordered_venue_ids: parsed.data.ordered_venue_ids,
  })

  if (error) return dbErr(error, 'reorder_group_members')
  return ok({ success: true })
}
