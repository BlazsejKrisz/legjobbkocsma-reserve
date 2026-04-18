import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireSuperAdmin, requireSupportOrAbove } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

type Params = { params: Promise<{ groupId: string }> }

const UpdateVenueGroupSchema = z.object({
  name: z.string().min(1).max(100),
})

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const { groupId } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('venue_groups')
    .select(`
      id, name, created_at,
      venue_group_members (
        id, venue_id, priority,
        venues (id, name)
      )
    `)
    .eq('id', groupId)
    .order('priority', { referencedTable: 'venue_group_members' })
    .single()

  if (error) return dbErr(error, 'get_venue_group')
  return ok({ data })
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { groupId } = await params
  const body = await safeJson(req)
  const parsed = UpdateVenueGroupSchema.safeParse(body)
  if (!parsed.success) return err('Invalid payload', { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venue_groups')
    .update({ name: parsed.data.name })
    .eq('id', groupId)
    .select('id, name, created_at')
    .single()

  if (error) return dbErr(error, 'update_venue_group')
  return ok({ data })
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { groupId } = await params
  const supabase = await createClient()

  const { error } = await supabase
    .from('venue_groups')
    .delete()
    .eq('id', groupId)

  if (error) return dbErr(error, 'delete_venue_group')
  return ok({ success: true })
}
