import { ok, dbErr } from '@/lib/api/http'
import { requireSupportOrAbove } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'

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

  return ok({ data: data ?? [] })
}
