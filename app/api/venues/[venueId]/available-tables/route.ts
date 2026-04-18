import { ok, err, dbErr } from '@/lib/api/http'
import { requireSupportOrAbove } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

type Params = { params: Promise<{ venueId: string }> }

const QuerySchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
})

export async function GET(req: Request, { params }: Params) {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const { venueId } = await params
  const url = new URL(req.url)

  const parsed = QuerySchema.safeParse({
    starts_at: url.searchParams.get('starts_at'),
    ends_at: url.searchParams.get('ends_at'),
  })
  if (!parsed.success) return err('Invalid query params', { status: 400, details: parsed.error.flatten() })

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_available_tables', {
    p_venue_id: Number(venueId),
    p_table_type_id: null,
    p_starts_at: parsed.data.starts_at,
    p_ends_at: parsed.data.ends_at,
    p_party_size: 1,  // pass 1 so can_fit is always true; UI shows capacity labels
    p_area: null,
  })

  if (error) return dbErr(error, 'get_available_tables')
  return ok({ data: data ?? [] })
}
