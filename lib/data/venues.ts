import { cacheLife, cacheTag } from 'next/cache'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import type { Venue, VenueSettings, VenueOpenHours, VenueIntegration, Weekday } from '@/lib/types/venue'
import type { UserSession } from '@/lib/auth/getSession'
import type { OutboxEvent, OutboxProviderSummary } from '@/lib/types/outbox'
import { tags } from './cacheTags'

const NUM_TO_WEEKDAY: Record<number, Weekday> = {
  1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday',
  5: 'friday', 6: 'saturday', 7: 'sunday',
}

// ─── Cache discipline ──────────────────────────────────────────────────
// Cached fetchers MUST NOT read cookies/auth — Next 16 cacheComponents
// forbids it inside 'use cache' boundaries.  Every cached function uses
// the admin client, which means it bypasses RLS — that's intentional:
// the cached row set is the same regardless of caller, and we filter
// in memory afterwards via session.venueIds when needed.
// Mutation handlers call `revalidateTag(...)` to invalidate.

// Returns ALL active+inactive venues from the row table.  Page-level
// callers should pass the result through `filterVenuesForSession` if
// they need to enforce venue_staff scoping.
async function _listAllVenuesCached(): Promise<Venue[]> {
  'use cache'
  cacheLife('minutes')
  cacheTag(tags.venues.all())
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, slug, is_active, created_at')
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as Venue[]
}

function filterVenuesForSession(venues: Venue[], session: UserSession): Venue[] {
  if (!session.isVenueStaff) return venues
  if (session.venueIds.length === 0) return []
  const allowed = new Set(session.venueIds.map(String))
  return venues.filter((v) => allowed.has(String(v.id)))
}

export async function listVenues(session: UserSession): Promise<Venue[]> {
  const all = await _listAllVenuesCached()
  return filterVenuesForSession(all, session)
}

export async function getVenue(id: string): Promise<Venue | null> {
  'use cache'
  cacheLife('minutes')
  cacheTag(tags.venues.one(id))
  const supabase = createAdminClient()
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
  'use cache'
  cacheLife('minutes')
  cacheTag(tags.venues.settings(venueId))
  const supabase = createAdminClient()
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
  'use cache'
  cacheLife('minutes')
  cacheTag(tags.venues.openHours(venueId))
  const supabase = createAdminClient()
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
  'use cache'
  cacheLife('minutes')
  cacheTag(tags.venues.integrations(venueId))
  const supabase = createAdminClient()
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

// Outbox summary is intentionally NOT cached — it's volatile (cron drains
// it every minute, retry buttons mutate it ad-hoc) and the UI uses it
// for live ops monitoring.  Caching even briefly would mask drain delays.
export async function getOutboxSummary(venueId: string): Promise<OutboxProviderSummary[]> {
  const supabase = createAdminClient()
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

// Failed events are also not cached — staff retry from this exact list
// and need to see the result of their action without a stale cache.
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
