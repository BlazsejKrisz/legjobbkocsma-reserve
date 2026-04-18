import { createClient } from '@/lib/supabase/server'
import type { Reservation } from '@/lib/types/reservation'
import type { UserSession } from '@/lib/auth/getSession'

const RESERVATION_SELECT = `
  id, requested_venue_id, assigned_venue_id, customer_id,
  starts_at, ends_at, party_size, status, source, overflow_reason,
  special_requests, internal_notes,
  auto_confirmation_email_sent_at, manual_confirmation_email_sent_at,
  created_at,
  customers (id, full_name, email, phone, created_at),
  requested_venue:requested_venue_id (id, name),
  assigned_venue:assigned_venue_id (id, name),
  reservation_tables (
    id, reservation_id, table_id, released_at,
    tables (id, name, area, capacity_min, capacity_max)
  )
`

export type ReservationFilters = {
  venueId?: string
  status?: string
  source?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  page?: number
  pageSize?: number
}

export async function listReservations(
  session: UserSession,
  filters: ReservationFilters = {},
): Promise<{ data: Reservation[]; count: number }> {
  const supabase = await createClient()
  const { page = 1, pageSize = 50 } = filters

  let query = supabase
    .from('reservations')
    .select(RESERVATION_SELECT, { count: 'exact' })
    .order('starts_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (session.isVenueStaff && session.venueIds.length > 0) {
    query = query.in('requested_venue_id', session.venueIds)
  }
  if (filters.venueId) query = query.eq('requested_venue_id', filters.venueId)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.dateFrom) query = query.gte('starts_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('starts_at', filters.dateTo)
  if (filters.search) {
    query = query.or(
      `customers.full_name.ilike.%${filters.search}%,customers.email.ilike.%${filters.search}%,customers.phone.ilike.%${filters.search}%`,
    )
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  return { data: (data ?? []) as unknown as Reservation[], count: count ?? 0 }
}

export async function getReservation(id: string): Promise<Reservation | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reservations')
    .select(RESERVATION_SELECT)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data as unknown as Reservation
}

export async function getOverflowReservations(
  session: UserSession,
  venueId?: string,
): Promise<Reservation[]> {
  const supabase = await createClient()

  let q = supabase
    .from('reservations')
    .select(RESERVATION_SELECT)
    .eq('status', 'pending_manual_review')
    .order('created_at', { ascending: true })

  if (venueId) q = q.eq('requested_venue_id', venueId)
  else if (session.isVenueStaff && session.venueIds.length > 0) {
    q = q.in('requested_venue_id', session.venueIds)
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Reservation[]
}

export async function getReallocationOptions(reservationId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_reallocation_options', {
    p_reservation_id: reservationId,
  })
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Fetch reservations for a specific venue and day for the timeline view.
 * Returns all reservations with table assignments for the given date range.
 */
export async function getTimelineReservations(
  venueId: string,
  dayStart: string,
  dayEnd: string,
): Promise<Reservation[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reservations')
    .select(RESERVATION_SELECT)
    .eq('requested_venue_id', venueId)
    .in('status', ['confirmed', 'pending_manual_review'])
    .gte('starts_at', dayStart)
    .lt('starts_at', dayEnd)
    .order('starts_at')

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Reservation[]
}
