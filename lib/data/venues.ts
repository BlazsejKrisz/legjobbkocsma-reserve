import { createClient } from '@/lib/supabase/server'
import type { Venue, VenueSettings, VenueOpenHours, VenueIntegration, Weekday } from '@/lib/types/venue'
import type { UserSession } from '@/lib/auth/getSession'
import type { OutboxEvent, OutboxProviderSummary } from '@/lib/types/outbox'

const NUM_TO_WEEKDAY: Record<number, Weekday> = {
  1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday',
  5: 'friday', 6: 'saturday', 7: 'sunday',
}

export async function listVenues(session: UserSession): Promise<Venue[]> {
  const supabase = await createClient()

  let query = supabase
    .from('venues')
    .select('id, name, slug, is_active, created_at')
    .order('name')

  if (session.isVenueStaff && session.venueIds.length > 0) {
    query = query.in('id', session.venueIds)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as Venue[]
}

export async function getVenue(id: string): Promise<Venue | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, slug, is_active, created_at')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data as Venue
}

export async function getVenueSettings(venueId: string): Promise<VenueSettings | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venue_settings')
    .select('*')
    .eq('venue_id', venueId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data as VenueSettings
}

export async function getVenueOpenHours(venueId: string): Promise<VenueOpenHours[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venue_open_hours')
    .select('*')
    .eq('venue_id', venueId)
    .order('weekday')

  if (error) throw new Error(error.message)

  // DB stores is_closed (boolean), weekday (smallint 1–7), and time as HH:MM:SS
  return (data ?? []).map(({ is_closed, weekday, open_time, close_time, ...rest }: {
    is_closed: boolean; weekday: number; open_time: string | null; close_time: string | null; [k: string]: unknown
  }) => ({
    ...rest,
    weekday: NUM_TO_WEEKDAY[weekday],
    is_open: !is_closed,
    open_time:  open_time  ? (open_time  as string).slice(0, 5) : null,
    close_time: close_time ? (close_time as string).slice(0, 5) : null,
  })) as VenueOpenHours[]
}

export async function getVenueIntegrations(venueId: string): Promise<VenueIntegration[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venue_integrations')
    .select('*')
    .eq('venue_id', venueId)
    .order('provider')

  if (error) throw new Error(error.message)
  return (data ?? []) as VenueIntegration[]
}

type OutboxSummaryRow = {
  venue_id: string
  provider: string
  status: string
  event_count: number
  oldest_created_at: string | null
}

export async function getOutboxSummary(venueId: string): Promise<OutboxProviderSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_outbox_summary', {
    p_venue_id: venueId,
  })
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as OutboxSummaryRow[]
  const byProvider = new Map<string, OutboxProviderSummary>()
  for (const row of rows) {
    if (!byProvider.has(row.provider)) {
      byProvider.set(row.provider, {
        provider: row.provider,
        pending: 0,
        delivering: 0,
        delivered: 0,
        failed: 0,
        skipped: 0,
      })
    }
    const summary = byProvider.get(row.provider)!
    const key = row.status as keyof Omit<OutboxProviderSummary, 'provider'>
    if (key in summary) summary[key] = row.event_count
  }
  return Array.from(byProvider.values())
}

export async function getFailedOutboxEvents(
  venueId: string,
  provider: string,
): Promise<OutboxEvent[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('integration_outbox')
    .select('*')
    .eq('venue_id', venueId)
    .eq('provider', provider)
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)
  return (data ?? []) as OutboxEvent[]
}
