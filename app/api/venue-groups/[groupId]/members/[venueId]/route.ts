import { ok, dbErr } from '@/lib/api/http'
import { requireSuperAdmin } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ groupId: string; venueId: string }> }

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { groupId, venueId } = await params
  const supabase = await createClient()

  const { error } = await supabase
    .from('venue_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('venue_id', venueId)

  if (error) return dbErr(error, 'remove_group_member')
  return ok({ success: true })
}
