import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireVenueAccess, requireSuperAdmin } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { VenueSettingsSchema } from '@/lib/validators/venues'

type Params = { params: Promise<{ venueId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireVenueAccess(venueId)
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venue_settings')
    .select('*')
    .eq('venue_id', venueId)
    .single()

  if (error) {
    // No settings row yet is normal — return null rather than 404
    if (error.code === 'PGRST116') return ok({ data: null })
    return dbErr(error)
  }

  return ok({ data })
}

export async function PUT(req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = VenueSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('venue_settings')
    .upsert({ venue_id: venueId, ...parsed.data }, { onConflict: 'venue_id' })

  if (error) return dbErr(error)

  return ok({ success: true })
}
