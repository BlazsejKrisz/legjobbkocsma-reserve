import type { ReservationTable } from './table'

export type ReservationStatus =
  | 'confirmed'
  | 'pending_manual_review'
  | 'cancelled'
  | 'completed'
  | 'no_show'

export type ReservationSource =
  | 'web'
  | 'phone'
  | 'admin'
  | 'walk_in'
  | 'partner'

export type OverflowReason =
  | 'no_table_available'
  | 'venue_capacity_reached'
  | 'auto_assignment_disabled'
  | 'outside_booking_window'
  | 'outside_open_hours'
  | 'party_size_exceeds_limit'
  | 'manual_review_required'

export type Customer = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  created_at: string
}

export type Reservation = {
  id: string
  requested_venue_id: string
  assigned_venue_id: string | null
  customer_id: string | null
  starts_at: string
  ends_at: string
  party_size: number
  status: ReservationStatus
  source: ReservationSource
  overflow_reason: OverflowReason | null
  special_requests: string | null
  internal_notes: string | null
  auto_confirmation_email_sent_at: string | null
  manual_confirmation_email_sent_at: string | null
  created_at: string
  // Joined
  customers: Customer | null
  requested_venue: { id: string; name: string } | null
  assigned_venue: { id: string; name: string } | null
  reservation_tables: ReservationTable[]
}

export type ReservationEvent = {
  id: string
  reservation_id: string
  event_type: string
  created_by: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
}

export type ReallocationOption = {
  option_kind:
    | 'same_venue_same_time'
    | 'same_venue_same_time_combined'
    | 'same_venue_other_time'
    | 'other_venue_same_time'
    | 'other_venue_same_time_combined'
    | 'group_venue_same_time'
    | 'group_venue_same_time_combined'
  venue_id: string
  venue_name: string
  table_ids: string[]
  starts_at: string
  ends_at: string
  note: string | null
}
