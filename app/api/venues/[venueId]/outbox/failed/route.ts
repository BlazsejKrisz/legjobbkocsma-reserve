import { ok, err, dbErr } from '@/lib/api/http'
import { requireSuperAdmin } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ venueId: string }> }

export async function GET(req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const provider = url.searchParams.get('provider')
  if (!provider) return err('provider is required', { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('integration_outbox')
    .select('*')
    .eq('venue_id', venueId)
    .eq('provider', provider)
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return dbErr(error)
  return ok({ data: data ?? [] })
}
