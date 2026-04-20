import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireVenueAccess, requireSuperAdmin, requireSupportOrAbove } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { UpsertTableSchema } from '@/lib/validators/tables'

type Params = { params: Promise<{ venueId: string }> }

// One-time fix: clear the erroneously auto-set blend_group = 'main' from all tables
export async function DELETE(_req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  const { error } = await supabase
    .from('tables')
    .update({ blend_group: null })
    .eq('venue_id', venueId)
    .eq('blend_group', 'main')

  if (error) return dbErr(error)
  return ok({ success: true })
}

export async function GET(_req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireVenueAccess(venueId)
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tables')
    .select('*, table_types (id, name, code, is_active)')
    .eq('venue_id', venueId)
    .order('sort_order')
    .order('name')

  if (error) return dbErr(error)
  return ok({ data: data ?? [] })
}

export async function POST(req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = UpsertTableSchema.safeParse(body)
  if (!parsed.success) return err('Invalid payload', { status: 400, details: parsed.error.flatten() })

  const supabase = await createClient()

  // Auto-assign sort_order to max + 1 for this venue to avoid unique constraint conflicts
  const { data: maxRow } = await supabase
    .from('tables')
    .select('sort_order')
    .eq('venue_id', venueId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const nextSortOrder = (maxRow?.sort_order ?? 0) + 1

  const { data, error } = await supabase
    .from('tables')
    .insert({ ...parsed.data, venue_id: venueId, sort_order: nextSortOrder })
    .select('*')
    .single()

  if (error) return dbErr(error)
  return ok({ data }, { status: 201 })
}
