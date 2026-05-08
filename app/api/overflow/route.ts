import { ok, dbErr } from '@/lib/api/http'
import { requireSupportOrAbove } from '@/lib/api/authz'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const RESERVATION_SELECT = `
  id, requested_venue_id, assigned_venue_id, customer_id,
  starts_at, ends_at, party_size, status, source, overflow_reason,
  special_requests, internal_notes,
  auto_confirmation_email_sent_at, manual_confirmation_email_sent_at,
  created_at,
  customers (id, full_name, email, phone),
  requested_venue:requested_venue_id (id, name),
  assigned_venue:assigned_venue_id (id, name),
  reservation_tables (
    id, reservation_id, table_id, released_at,
    tables (id, name, area, capacity_min, capacity_max)
  )
`

export async function GET(req: Request) {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const venueId = url.searchParams.get('venue_id') ?? undefined

  const supabase = await createClient()

  let query = supabase
    .from('reservations')
    .select(RESERVATION_SELECT)
    .eq('status', 'pending_manual_review')
    .order('created_at', { ascending: true })

  if (venueId) {
    query = query.eq('requested_venue_id', venueId)
  } else if (auth.session.isVenueStaff && auth.session.venueIds.length > 0) {
    query = query.in('requested_venue_id', auth.session.venueIds)
  }

  const { data, error } = await query
  if (error) return dbErr(error)

  // Waitlist enrichment: for each overflow row, check whether the requested
  // slot has any free single table or combo right now.  If yes, the row gets
  // `has_waitlist_match: true` so the UI can surface a "this one fits now"
  // indicator.  Typically ~5-20 overflow rows, so a per-row RPC call is
  // acceptable; can be batched in a single SQL function later if it grows.
  const admin = createAdminClient()
  const enriched = await Promise.all(
    (data ?? []).map(async (r) => {
      try {
        const duration = Math.round(
          (new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) / 60_000,
        )
        const { data: matches } = await admin.rpc('find_availability_with_alternatives', {
          p_venue_id: r.requested_venue_id,
          p_starts_at: r.starts_at,
          p_duration_minutes: duration,
          p_party_size: r.party_size,
          p_alt_time_window_minutes: 0,
          p_alt_time_step_minutes: 30,
        })
        const hasMatch = (matches ?? []).some(
          (m: { match_type: string }) => m.match_type === 'requested',
        )
        return { ...r, has_waitlist_match: hasMatch }
      } catch {
        return { ...r, has_waitlist_match: false }
      }
    }),
  )

  return ok({ data: enriched })
}
