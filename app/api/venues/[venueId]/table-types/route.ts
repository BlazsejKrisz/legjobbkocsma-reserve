import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireVenueAccess, requireSupportOrAbove } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { UpsertTableTypeSchema } from '@/lib/validators/tables'

type Params = { params: Promise<{ venueId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireVenueAccess(venueId)
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('table_types')
    .select('id, name, code, is_active, created_at')
    .order('name')

  if (error) return dbErr(error)
  return ok({ data: data ?? [] })
}

export async function POST(req: Request, { params }: Params) {
  await params
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = UpsertTableTypeSchema.safeParse(body)
  if (!parsed.success) return err('Invalid payload', { status: 400, details: parsed.error.flatten() })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('table_types')
    .insert(parsed.data)
    .select('*')
    .single()

  if (error) return dbErr(error)
  return ok({ data }, { status: 201 })
}
