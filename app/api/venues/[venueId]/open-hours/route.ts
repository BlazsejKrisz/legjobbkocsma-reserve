import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireVenueAccess, requireSuperAdmin } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'
import { UpsertOpenHoursSchema } from '@/lib/validators/venues'
import type { Weekday } from '@/lib/types/venue'

type Params = { params: Promise<{ venueId: string }> }

/** DB row shape — weekday is smallint (1=Mon … 7=Sun), is_closed not is_open */
type DbRow = {
  venue_id: string
  weekday: number
  is_closed: boolean
  open_time: string | null
  close_time: string | null
}

const WEEKDAY_TO_NUM: Record<Weekday, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  friday: 5, saturday: 6, sunday: 7,
}
const NUM_TO_WEEKDAY: Record<number, Weekday> = {
  1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday',
  5: 'friday', 6: 'saturday', 7: 'sunday',
}

/** DB returns time as HH:MM:SS — truncate to HH:MM for the app */
function toHHMM(t: string | null): string | null {
  return t ? t.slice(0, 5) : null
}

/** Convert DB row → app shape (smallint→name, is_closed→is_open, HH:MM:SS→HH:MM) */
function toAppRow(row: DbRow) {
  const { is_closed, weekday, open_time, close_time, ...rest } = row
  return {
    ...rest,
    weekday: NUM_TO_WEEKDAY[weekday],
    is_open: !is_closed,
    open_time: toHHMM(open_time),
    close_time: toHHMM(close_time),
  }
}

export async function GET(_req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireVenueAccess(venueId)
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venue_open_hours')
    .select('*')
    .eq('venue_id', venueId)
    .order('weekday')

  if (error) return dbErr(error)

  return ok({ data: (data as DbRow[]).map(toAppRow) })
}

export async function PUT(req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = UpsertOpenHoursSchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }

  const supabase = await createClient()

  const { error: deleteError } = await supabase
    .from('venue_open_hours')
    .delete()
    .eq('venue_id', venueId)

  if (deleteError) return dbErr(deleteError, 'delete open_hours')

  // Flip is_open → is_closed and weekday name → smallint at the write boundary
  const rows = parsed.data.map(({ is_open, weekday, ...row }) => ({
    venue_id: venueId,
    ...row,
    weekday: WEEKDAY_TO_NUM[weekday as Weekday],
    is_closed: !is_open,
  }))

  const { error: insertError } = await supabase.from('venue_open_hours').insert(rows)
  if (insertError) return dbErr(insertError, 'insert open_hours')

  return ok({ success: true })
}
