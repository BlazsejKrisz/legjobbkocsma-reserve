import { z } from 'zod'

export const ReservationSourceSchema = z.enum([
  'web', 'phone', 'admin', 'walk_in', 'partner',
])

export const CreateReservationSchema = z.object({
  venue_id: z.coerce.number().int().positive(),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  party_size: z.coerce.number().int().min(1).max(500),
  source: ReservationSourceSchema.default('admin'),
  special_requests: z.string().max(2000).nullable().optional(),
  internal_notes: z.string().max(2000).nullable().optional(),
  area: z.string().optional(),
  customer_full_name: z.string().min(1).max(200).optional(),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().max(30).optional(),
  requested_table_type_id: z.coerce.number().int().positive().optional(),
})
export type CreateReservationPayload = z.infer<typeof CreateReservationSchema>

export const ReassignReservationSchema = z.object({
  new_table_ids: z.array(z.coerce.number().int().positive()).min(1),
  new_venue_id: z.coerce.number().int().positive(),
  new_starts_at: z.iso.datetime({ offset: true }),
  new_ends_at: z.iso.datetime({ offset: true }),
  customer_service_note: z.string().max(2000).optional(),
  send_confirmation_email: z.boolean().default(false),
})
export type ReassignReservationPayload = z.infer<typeof ReassignReservationSchema>

export const UpdateReservationSchema = z.object({
  // status changes
  status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).optional(),
  cancel_note: z.string().optional(),
  // notes-only quick edit (legacy path, still supported)
  internal_notes: z.string().nullable().optional(),
  special_requests: z.string().nullable().optional(),
  // full field edit (calls update_reservation_fields RPC)
  customer_full_name: z.string().min(1).max(200).optional(),
  customer_phone: z.string().max(30).nullable().optional(),
  customer_email: z.string().email().nullable().optional(),
  party_size: z.coerce.number().int().min(1).optional(),
  starts_at: z.string().datetime({ offset: true }).optional(),
  ends_at: z.string().datetime({ offset: true }).optional(),
})
export type UpdateReservationPayload = z.infer<typeof UpdateReservationSchema>

export const CancelReservationSchema = z.object({
  note: z.string().max(2000).optional(),
})
export type CancelReservationPayload = z.infer<typeof CancelReservationSchema>

// Partner API (public-facing booking form)
export const PartnerReservationSchema = z.object({
  venue_slug: z.string().min(1),
  starts_at: z.string().min(1).refine(
    (v) => !isNaN(new Date(v).getTime()),
    { message: 'Invalid datetime' },
  ),
  party_size: z.coerce.number().int().min(1).max(500),
  duration_minutes: z.number().int().min(15).max(1440).optional(),
  table_type_code: z.string().optional(),
  area: z.string().optional(),
  customer: z.object({
    full_name: z.string().min(1).max(200),
    email: z.string().email().optional(),
    phone: z.string().max(30).optional(),
  }).refine((c) => c.email || c.phone, {
    message: 'At least one of email or phone is required',
  }),
  message: z.string().max(2000).optional(),
})
export type PartnerReservationPayload = z.infer<typeof PartnerReservationSchema>
