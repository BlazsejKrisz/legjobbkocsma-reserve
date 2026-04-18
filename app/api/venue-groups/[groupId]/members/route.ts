import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireSuperAdmin } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

type Params = { params: Promise<{ groupId: string }> }

const AddMemberSchema = z.object({
  venue_id: z.coerce.number().int().positive(),
})

export async function POST(req: Request, { params }: Params) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { groupId } = await params
  const body = await safeJson(req)
  const parsed = AddMemberSchema.safeParse(body)
  if (!parsed.success) return err('Invalid payload', { status: 400 })

  const supabase = await createClient()

  // Append at the end: max existing priority + 1
  const { data: maxRow } = await supabase
    .from('venue_group_members')
    .select('priority')
    .eq('group_id', groupId)
    .order('priority', { ascending: false })
    .limit(1)
    .single()

  const nextPriority = (maxRow?.priority ?? -1) + 1

  const { data, error } = await supabase
    .from('venue_group_members')
    .insert({ group_id: Number(groupId), venue_id: parsed.data.venue_id, priority: nextPriority })
    .select('id, group_id, venue_id, priority, venues (id, name)')
    .single()

  if (error) return dbErr(error, 'add_group_member')
  return ok({ data }, { status: 201 })
}
