import { ok, dbErr } from '@/lib/api/http'
import { requireSupportOrAbove } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const search = url.searchParams.get('search') || null
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(Number(url.searchParams.get('page_size') ?? '50'), 100)

  const supabase = createAdminClient()

  const [listResult, countResult] = await Promise.all([
    supabase.rpc('get_customer_list', {
      p_search: search,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    }),
    supabase.rpc('get_customer_count', { p_search: search }),
  ])

  if (listResult.error) return dbErr(listResult.error, 'get_customer_list')
  if (countResult.error) return dbErr(countResult.error, 'get_customer_count')

  return ok({
    data: listResult.data ?? [],
    count: Number(countResult.data ?? 0),
    page,
    pageSize,
  })
}
