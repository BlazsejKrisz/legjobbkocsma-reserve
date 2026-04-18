import { ok, err, dbErr } from '@/lib/api/http'
import { requireAuth } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { canAccessVenue } from '@/lib/auth/getSession'

type Params = { params: Promise<{ reservationId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { reservationId } = await params
  const supabase = await createClient()

  // Verify access via the reservation's venue
  const { data: reservation, error: resError } = await supabase
    .from('reservations')
    .select('requested_venue_id')
    .eq('id', reservationId)
    .single()

  if (resError || !reservation) return err('Not found', { status: 404 })
  if (!canAccessVenue(auth.session, reservation.requested_venue_id)) return err('Forbidden', { status: 403 })

  const { data, error } = await supabase
    .from('reservation_events')
    .select('id, event_type, created_by, old_value, new_value, created_at')
    .eq('reservation_id', reservationId)
    .order('created_at', { ascending: false })

  if (error) return dbErr(error)

  return ok({ data: data ?? [] })
}
