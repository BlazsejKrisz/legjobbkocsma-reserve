import { z } from 'zod'
import { ReservationSourceSchema } from './reservations'

// Search criteria for the availability checker.
export const CheckAvailabilitySchema = z.object({
  venue_id: z.coerce.number().int().positive(),
  starts_at: z.iso.datetime({ offset: true }),
  duration_minutes: z.coerce.number().int().min(15).max(720).default(120),
  party_size: z.coerce.number().int().min(1).max(500),
  table_type_id: z.coerce.number().int().positive().nullable().optional(),
  area: z.string().nullable().optional(),
  alt_time_window_minutes: z.coerce.number().int().min(0).max(360).default(180),
  alt_time_step_minutes: z.coerce.number().int().min(15).max(120).default(30),
  // When set, the availability check pretends this reservation's tables
  // don't exist — used by the edit dialog to ask "would the new criteria
  // fit if my own current booking weren't holding tables?"
  exclude_reservation_id: z.coerce.number().int().positive().nullable().optional(),
})
export type CheckAvailabilityPayload = z.infer<typeof CheckAvailabilitySchema>

// Confirm a reservation from the availability checker — staff has picked
// specific tables, we skip auto-assignment and lock those in.
export const CreateFromAvailabilitySchema = z.object({
  venue_id: z.coerce.number().int().positive(),
  starts_at: z.iso.datetime({ offset: true }),
  duration_minutes: z.coerce.number().int().min(15).max(720),
  party_size: z.coerce.number().int().min(1).max(500),
  table_ids: z.array(z.coerce.number().int().positive()).min(1),
  source: ReservationSourceSchema.default('phone'),
  special_requests: z.string().max(2000).nullable().optional(),
  internal_notes: z.string().max(2000).nullable().optional(),
  requested_table_type_id: z.coerce.number().int().positive().nullable().optional(),
  customer_full_name: z.string().min(1).max(200),
  customer_email: z.string().email().nullable().optional(),
  customer_phone: z.string().nullable().optional(), // E.164 — validated server-side via libphonenumber
  notification_channel: z.enum(['email', 'sms', 'none']).default('none'),
})
export type CreateFromAvailabilityPayload = z.infer<typeof CreateFromAvailabilitySchema>
