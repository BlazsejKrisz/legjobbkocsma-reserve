import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireSupportOrAbove } from '@/lib/api/authz'
import { canAccessVenue } from '@/lib/auth/getSession'
import { createAdminClient } from '@/lib/supabase/server'
import { CheckAvailabilitySchema } from '@/lib/validators/availability'

// Returns availability options grouped by match_type:
//   • 'requested' — slots that fit the asked-for venue/time
//   • 'alt_time'  — alternatives at same venue, different time (only when
//                   no requested-slot match)
//   • 'alt_venue' — same time at sibling venues in the venue group
export async function POST(req: Request) {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = CheckAvailabilitySchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }
  const payload = parsed.data

  if (!canAccessVenue(auth.session, payload.venue_id)) {
    return err('Forbidden', { status: 403 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('find_availability_with_alternatives', {
    p_venue_id: payload.venue_id,
    p_starts_at: payload.starts_at,
    p_duration_minutes: payload.duration_minutes,
    p_party_size: payload.party_size,
    p_table_type_id: payload.table_type_id ?? null,
    p_area: payload.area ?? null,
    p_alt_time_window_minutes: payload.alt_time_window_minutes,
    p_alt_time_step_minutes: payload.alt_time_step_minutes,
    p_exclude_reservation_id: payload.exclude_reservation_id ?? null,
  })

  if (error) return dbErr(error, 'find_availability_with_alternatives')

  return ok({ data: data ?? [] })
}
