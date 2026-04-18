import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireVenueAccess, requireSuperAdmin } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { UpdateVenueSchema } from '@/lib/validators/venues'

type Params = { params: Promise<{ venueId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireVenueAccess(venueId)
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, slug, is_active, created_at')
    .eq('id', venueId)
    .single()

  if (error) return dbErr(error)

  return ok({ data })
}

export async function PATCH(req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = UpdateVenueSchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('venues')
    .update(parsed.data)
    .eq('id', venueId)

  if (error) return dbErr(error)

  return ok({ success: true })
}
