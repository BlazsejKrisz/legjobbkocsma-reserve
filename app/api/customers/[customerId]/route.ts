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
