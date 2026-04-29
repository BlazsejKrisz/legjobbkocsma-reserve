import { z } from 'zod'
import { WEEKDAYS } from '@/lib/types/venue'

export const CreateVenueSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers and hyphens'),
})

export const UpdateVenueSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  is_active: z.boolean().optional(),
})

export const VenueSettingsSchema = z.object({
  booking_enabled: z.boolean(),
  auto_assignment_enabled: z.boolean(),
  overflow_queue_enabled: z.boolean(),
  default_duration_minutes: z.number().int().min(15).max(1440),
  min_duration_minutes: z.number().int().min(15).max(1440),
  max_duration_minutes: z.number().int().min(15).max(1440),
  min_notice_minutes: z.number().int().min(0),
  max_advance_booking_days: z.number().int().min(1).max(365),
  max_party_size: z.number().int().min(1),
  max_total_capacity: z.number().int().min(1),
  booking_buffer_before_minutes: z.number().int().min(0),
  booking_buffer_after_minutes: z.number().int().min(0),
  allow_combining_tables: z.boolean(),
  allow_cross_group_table_blending: z.boolean(),
  allow_alternative_time_suggestions: z.boolean(),
  allow_cross_venue_suggestions: z.boolean(),
  last_booking_before_close_minutes: z.number().int().min(15).max(1440).nullable().optional(),
})

const WeekdaySchema = z.enum(WEEKDAYS as [string, ...string[]])

export const OpenHoursRowSchema = z.object({
  weekday: WeekdaySchema,
  is_open: z.boolean(),
  open_time: z.string().nullable(),
  close_time: z.string().nullable(),
})

export const UpsertOpenHoursSchema = z.array(OpenHoursRowSchema).length(7)

export const UpsertIntegrationSchema = z.object({
  provider: z.string().min(1).max(50),
  is_enabled: z.boolean(),
  external_location_id: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
})

export type CreateVenuePayload = z.infer<typeof CreateVenueSchema>
export type VenueSettingsPayload = z.infer<typeof VenueSettingsSchema>
export type UpsertOpenHoursPayload = z.infer<typeof UpsertOpenHoursSchema>
export type UpsertIntegrationPayload = z.infer<typeof UpsertIntegrationSchema>
