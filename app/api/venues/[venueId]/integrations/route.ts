import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireVenueAccess, requireSuperAdmin } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

type Params = { params: Promise<{ venueId: string }> }

const UpsertIntegrationSchema = z.object({
  provider: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  is_enabled: z.boolean().default(false),
})

export async function GET(_req: Request, { params }: Params) {
  const { venueId } = await params
  void _req
  const auth = await requireVenueAccess(venueId)
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venue_integrations')
    .select('*')
    .eq('venue_id', venueId)
    .order('provider')

  if (error) return dbErr(error)
  return ok({ data: data ?? [] })
}

export async function POST(req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = UpsertIntegrationSchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venue_integrations')
    .upsert(
      { venue_id: venueId, ...parsed.data },
      { onConflict: 'venue_id,provider' },
    )
    .select('*')
    .single()

  if (error) return dbErr(error)
  return ok({ data }, { status: 201 })
}
