export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export const WEEKDAYS: Weekday[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

export type Venue = {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
}

export type VenueSettings = {
  venue_id: string
  booking_enabled: boolean
  auto_assignment_enabled: boolean
  overflow_queue_enabled: boolean
  default_duration_minutes: number
  min_duration_minutes: number
  max_duration_minutes: number
  min_notice_minutes: number
  max_advance_booking_days: number
  max_party_size: number
  max_total_capacity: number
  booking_buffer_before_minutes: number
  booking_buffer_after_minutes: number
  allow_combining_tables: boolean
  allow_cross_group_table_blending: boolean
  allow_alternative_time_suggestions: boolean
  allow_cross_venue_suggestions: boolean
}

export type VenueOpenHours = {
  venue_id: string
  weekday: Weekday
  is_open: boolean
  open_time: string | null  // HH:MM
  close_time: string | null // HH:MM — may be <= open_time for overnight venues
}

export type IntegrationProvider = 'fruit' | (string & {})

export type VenueIntegration = {
  id: string
  venue_id: string
  provider: IntegrationProvider
  is_enabled: boolean
  external_location_id: string | null
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type VenueWithSettings = Venue & {
  venue_settings: VenueSettings | null
}
