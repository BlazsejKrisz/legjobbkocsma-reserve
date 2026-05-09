import { createAdminClient } from '@/lib/supabase/server'

// Per-RPC fetchers for the stats page.  Each one is awaited inside its
// own Suspense boundary on the page, so a slow RPC streams independently
// instead of holding back the entire chart grid.
//
// All RPCs are SECURITY DEFINER + grant-scoped to service_role per
// migration 014.  Calling via the admin client is intentional — RLS
// would limit by the caller, but stats are aggregated dashboards
// already gated at the page level (super_admin/support only).
//
// Errors are logged explicitly so silent RPC failures (e.g. signature
// drift, missing migration) don't end up looking like "page is empty"
// — they show up in the server logs.

export type DailyStatRow = {
  day: string
  total: number
  confirmed: number
  cancelled: number
  no_show: number
  completed: number
  overflow: number
  total_guests: number
}

export type StatsArgs = {
  fromStr: string
  toStr: string
  venueId: number | null
}

function venueArg(venueId: number | null) {
  return venueId ? { p_venue_id: venueId } : {}
}

function logRpcErr(name: string, err: { message: string; code?: string | null }) {
  console.error(`[stats/${name}]`, JSON.stringify({ message: err.message, code: err.code ?? null }))
}

export async function getDailyStats({ fromStr, toStr, venueId }: StatsArgs) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_reservation_stats', {
    p_from: fromStr,
    p_to: toStr,
    ...venueArg(venueId),
  })
  if (error) logRpcErr('get_reservation_stats', error)
  return (data ?? []) as DailyStatRow[]
}

export async function getSourceStats({ fromStr, toStr, venueId }: StatsArgs) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_source_stats', {
    p_from: fromStr,
    p_to: toStr,
    ...venueArg(venueId),
  })
  if (error) logRpcErr('get_source_stats', error)
  return (data ?? []) as Array<{ source: string; total: number }>
}

export async function getVenueStats({ fromStr, toStr }: Pick<StatsArgs, 'fromStr' | 'toStr'>) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_venue_stats', { p_from: fromStr, p_to: toStr })
  if (error) logRpcErr('get_venue_stats', error)
  return (data ?? []) as Array<{
    venue_id: number
    venue_name: string
    total: number
    confirmed: number
    cancelled: number
    guests: number
  }>
}

export async function getDowStats({ fromStr, toStr, venueId }: StatsArgs) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_dow_stats', {
    p_from: fromStr,
    p_to: toStr,
    ...venueArg(venueId),
  })
  if (error) logRpcErr('get_dow_stats', error)
  return (data ?? []) as Array<{ dow: number; total: number; guests: number }>
}

export async function getHodStats({ fromStr, toStr, venueId }: StatsArgs) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_hod_stats', {
    p_from: fromStr,
    p_to: toStr,
    ...venueArg(venueId),
  })
  if (error) logRpcErr('get_hod_stats', error)
  return (data ?? []) as Array<{ hour: number; total: number; guests: number }>
}

export async function getLeadTimeStats({ fromStr, toStr, venueId }: StatsArgs) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_lead_time_stats', {
    p_from: fromStr,
    p_to: toStr,
    ...venueArg(venueId),
  })
  if (error) logRpcErr('get_lead_time_stats', error)
  return (data ?? []) as Array<{ bucket: string; total: number }>
}
