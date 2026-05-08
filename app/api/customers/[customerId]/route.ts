import { ok, err, dbErr } from '@/lib/api/http'
import { requireAuth } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'

const RESERVATION_SELECT = `
  id, starts_at, ends_at, party_size, status, source, overflow_reason,
  special_requests, internal_notes, created_at,
  requested_venue:requested_venue_id (id, name),
  assigned_venue:assigned_venue_id (id, name),
  reservation_tables (
    id, table_id, released_at,
    tables (id, name, area)
  )
`

type Params = { params: Promise<{ customerId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { customerId } = await params
  const supabase = await createClient()

  const [customerResult, reservationsResult] = await Promise.all([
    supabase
      .from('customers')
      .select('id, full_name, email, phone, created_at')
      .eq('id', customerId)
      .single(),
    supabase
      .from('reservations')
      .select(RESERVATION_SELECT)
      .eq('customer_id', customerId)
      .order('starts_at', { ascending: false }),
  ])

  if (customerResult.error || !customerResult.data) {
    return err('Customer not found', { status: 404 })
  }
  if (reservationsResult.error) return dbErr(reservationsResult.error)

  const reservations = reservationsResult.data ?? []

  // venue_staff can only view customers who have reservations at their venue(s)
  if (auth.session.isVenueStaff && auth.session.venueIds.length > 0) {
    const accessible = new Set(auth.session.venueIds.map(String))
    const hasAccess = reservations.some((r) => {
      const req = (r.requested_venue as unknown as { id: string } | null)?.id
      const asg = (r.assigned_venue as unknown as { id: string } | null)?.id
      return accessible.has(String(req)) || accessible.has(String(asg))
    })
    if (!hasAccess) return err('Forbidden', { status: 403 })
  }
  const totalGuests = reservations.reduce((sum, r) => sum + r.party_size, 0)
  const completedCount = reservations.filter((r) => r.status === 'completed').length
  const cancelledCount = reservations.filter((r) => r.status === 'cancelled').length

  return ok({
    data: {
      ...customerResult.data,
      reservations,
      stats: {
        total: reservations.length,
        completed: completedCount,
        cancelled: cancelledCount,
        total_guests: totalGuests,
      },
    },
  })
}
