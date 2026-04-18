import { ok, err, dbErr } from '@/lib/api/http'
import { requireAuth } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { canAccessVenue } from '@/lib/auth/getSession'
import { dayWindowUTC } from '@/lib/datetime'

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
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const venueId = url.searchParams.get('venue_id')
  const date = url.searchParams.get('date') // YYYY-MM-DD in venue TZ

  if (!venueId || !date) return err('venue_id and date are required', { status: 400 })
  if (!canAccessVenue(auth.session, venueId)) return err('Forbidden', { status: 403 })

  const { from: dayStart, to: dayEnd } = dayWindowUTC(date)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reservations')
    .select(RESERVATION_SELECT)
    .eq('requested_venue_id', venueId)
    .in('status', ['confirmed', 'pending_manual_review'])
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd)
    .order('starts_at')

  if (error) return dbErr(error)
  return ok({ data: data ?? [] })
}
