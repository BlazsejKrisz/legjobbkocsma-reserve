import { ok, err, dbErr } from '@/lib/api/http'
import { requireSupportOrAbove } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'

const VALID_STATUSES = new Set(['pending', 'sending', 'sent', 'failed', 'dead'])
const VALID_CHANNELS = new Set(['email', 'sms'])
const VALID_KINDS = new Set(['confirmation', 'received', 'updated', 'reminder', 'cancellation'])

export async function GET(req: Request) {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const status   = url.searchParams.get('status') ?? undefined
  const channel  = url.searchParams.get('channel') ?? undefined
  const kind     = url.searchParams.get('kind') ?? undefined
  const search   = url.searchParams.get('search') ?? undefined
  const venueId  = url.searchParams.get('venue_id') ?? undefined
  const page     = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(Number(url.searchParams.get('page_size') ?? '50'), 200)

  const supabase = createAdminClient()

  // Join through reservations → venues so the dashboard can filter by venue
  // (and surface the venue name in the row for context).
  let query = supabase
    .from('notification_outbox')
    .select(
      `id, reservation_id, channel, kind, to_address, status, attempts,
       provider_id, last_error, next_attempt_at, created_at, sent_at,
       reservation:reservation_id (
         id, starts_at,
         requested_venue:requested_venue_id (id, name),
         assigned_venue:assigned_venue_id (id, name)
       )`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (status && VALID_STATUSES.has(status)) query = query.eq('status', status)
  if (channel && VALID_CHANNELS.has(channel)) query = query.eq('channel', channel)
  if (kind && VALID_KINDS.has(kind)) query = query.eq('kind', kind)
  if (search) {
    const escaped = search.replace(/[%_\\]/g, '\\$&')
    query = query.ilike('to_address', `%${escaped}%`)
  }
  if (venueId) {
    // Venue filter pushes through the joined reservation.  Use IN with the
    // assigned/requested venue ids — Postgrest doesn't easily express OR
    // across a joined table without a view, so we go via a sub-select.
    const { data: venueReservationIds } = await supabase
      .from('reservations')
      .select('id')
      .or(`requested_venue_id.eq.${venueId},assigned_venue_id.eq.${venueId}`)
    const ids = (venueReservationIds ?? []).map((r) => r.id)
    if (ids.length === 0) return ok({ data: [], count: 0, page, pageSize })
    query = query.in('reservation_id', ids)
  }

  const { data, error, count } = await query
  if (error) return dbErr(error)

  return ok({ data: data ?? [], count: count ?? 0, page, pageSize })
}

// Top-line stats for the dashboard cards.  Last 7 days, grouped by status.
export async function POST(req: Request) {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => ({}))
  if (body?.op !== 'stats') return err('Unknown op', { status: 400 })

  const supabase = createAdminClient()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Postgrest doesn't expose group_by — five fast indexed counts.
  const counts = await Promise.all(
    (['sent', 'failed', 'dead', 'pending', 'sending'] as const).map(async (s) => {
      const { count } = await supabase
        .from('notification_outbox')
        .select('id', { count: 'exact', head: true })
        .eq('status', s)
        .gte('created_at', since)
      return [s, count ?? 0] as const
    }),
  )

  return ok({ data: Object.fromEntries(counts) })
}
