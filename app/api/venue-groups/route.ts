import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireSuperAdmin, requireSupportOrAbove } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const CreateVenueGroupSchema = z.object({
  name: z.string().min(1).max(100),
})

export async function GET() {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

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
    .order('name')
    .order('priority', { referencedTable: 'venue_group_members' })

  if (error) return dbErr(error, 'list_venue_groups')
  return ok({ data: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = CreateVenueGroupSchema.safeParse(body)
  if (!parsed.success) return err('Invalid payload', { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venue_groups')
    .insert({ name: parsed.data.name })
    .select('id, name, created_at')
    .single()

  if (error) return dbErr(error, 'create_venue_group')
  return ok({ data }, { status: 201 })
}
