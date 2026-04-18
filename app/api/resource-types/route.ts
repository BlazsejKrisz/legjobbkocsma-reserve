import { ok, dbErr } from '@/lib/api/http'
import { requireAuth } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'

// Table types are the resource type concept in this schema (global, not per-venue)
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('table_types')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name')

  if (error) return dbErr(error)
  return ok({ data: data ?? [] })
}
