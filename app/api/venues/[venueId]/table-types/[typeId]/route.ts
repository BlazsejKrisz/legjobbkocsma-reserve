import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireSupportOrAbove } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { UpsertTableTypeSchema } from '@/lib/validators/tables'

type Params = { params: Promise<{ venueId: string; typeId: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const { typeId } = await params
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = UpsertTableTypeSchema.partial().safeParse(body)
  if (!parsed.success) return err('Invalid payload', { status: 400, details: parsed.error.flatten() })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('table_types')
    .update(parsed.data)
    .eq('id', typeId)
    .select('*')
    .single()

  if (error) return dbErr(error)
  return ok({ data })
}
