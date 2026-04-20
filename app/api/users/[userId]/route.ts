import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireSuperAdmin } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'

type Params = { params: Promise<{ userId: string }> }

const AssignRoleSchema = z.object({
  role: z.enum(['super_admin', 'support', 'venue_staff']),
})

// venue_user_assignments.venue_id is bigint — must be a number, not a UUID
const AssignVenueSchema = z.object({
  venue_id: z.coerce.number().int().positive(),
})

export async function POST(req: Request, { params }: Params) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { userId } = await params
  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const supabase = createAdminClient()

  if (action === 'assign_role') {
    const body = await safeJson(req)
    const parsed = AssignRoleSchema.safeParse(body)
    if (!parsed.success) return err('Invalid payload', { status: 400 })

    const { error } = await supabase.rpc('assign_user_role', {
      p_user_id: userId,
      p_role: parsed.data.role,
    })
    if (error) return dbErr(error, 'assign_user_role')
    return ok({ success: true })
  }

  if (action === 'assign_venue') {
    const body = await safeJson(req)
    const parsed = AssignVenueSchema.safeParse(body)
    if (!parsed.success) return err('Invalid payload', { status: 400 })

    const { error } = await supabase.rpc('assign_user_to_venue', {
      p_user_id: userId,
      p_venue_id: parsed.data.venue_id,
    })
    if (error) return dbErr(error, 'assign_user_to_venue')
    return ok({ success: true })
  }

  if (action === 'remove_venue') {
    const body = await safeJson(req)
    const parsed = AssignVenueSchema.safeParse(body)
    if (!parsed.success) return err('Invalid payload', { status: 400 })

    const { error } = await supabase
      .from('venue_user_assignments')
      .delete()
      .eq('user_id', userId)
      .eq('venue_id', parsed.data.venue_id)

    if (error) return dbErr(error, 'remove_venue_assignment')
    return ok({ success: true })
  }

  return err('Unknown action', { status: 400 })
}
