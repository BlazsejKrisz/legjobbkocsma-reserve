import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireSuperAdmin } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { UpsertTableSchema } from '@/lib/validators/tables'

type Params = { params: Promise<{ venueId: string; tableId: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const { venueId, tableId } = await params
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = UpsertTableSchema.partial().safeParse(body)
  if (!parsed.success) return err('Invalid payload', { status: 400, details: parsed.error.flatten() })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tables')
    .update(parsed.data)
    .eq('id', tableId)
    .eq('venue_id', venueId)
    .select('*')
    .single()

  if (error) return dbErr(error)
  return ok({ data })
}
