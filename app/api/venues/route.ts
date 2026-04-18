import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireAuth, requireSuperAdmin } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { CreateVenueSchema } from '@/lib/validators/venues'

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const supabase = await createClient()

  let query = supabase
    .from('venues')
    .select('id, name, slug, is_active, created_at')
    .order('name')

  if (auth.session.isVenueStaff && auth.session.venueIds.length > 0) {
    query = query.in('id', auth.session.venueIds)
  }

  const { data, error } = await query
  if (error) return dbErr(error)

  return ok({ data: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = CreateVenueSchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('create_venue_with_setup', {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  })

  if (error) return dbErr(error, 'create_venue_with_setup')

  return ok({ data }, { status: 201 })
}
