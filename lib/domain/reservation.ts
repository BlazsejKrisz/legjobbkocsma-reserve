import type { ReservationStatus, OverflowReason, ReservationSource } from '@/lib/types/reservation'

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: 'Confirmed',
  pending_manual_review: 'Manual Review',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No Show',
}

export const STATUS_CLASSES: Record<ReservationStatus, string> = {
  confirmed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  pending_manual_review: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  cancelled: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  completed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  no_show: 'bg-red-500/15 text-red-400 border-red-500/30',
}

export const OVERFLOW_REASON_LABELS: Record<OverflowReason, string> = {
  no_table_available: 'No table available',
  venue_capacity_reached: 'Venue at capacity',
  auto_assignment_disabled: 'Auto-assignment disabled',
  outside_booking_window: 'Outside booking window',
  outside_open_hours: 'Outside open hours',
  party_size_exceeds_limit: 'Party size exceeds limit',
  manual_review_required: 'Manual review required',
}

export const SOURCE_LABELS: Record<ReservationSource, string> = {
  web: 'Web',
  phone: 'Phone',
  admin: 'Admin',
  walk_in: 'Walk-in',
  partner: 'Partner',
}

export function isOverflowStatus(status: ReservationStatus): boolean {
  return status === 'pending_manual_review'
}

export function isActiveStatus(status: ReservationStatus): boolean {
  return status === 'confirmed' || status === 'pending_manual_review'
}

export function isTerminalStatus(status: ReservationStatus): boolean {
  return status === 'cancelled' || status === 'completed' || status === 'no_show'
}
