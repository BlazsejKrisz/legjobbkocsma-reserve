import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { AppRole } from '@/lib/types/user'

export type UserSession = {
  userId: string
  role: AppRole
  venueIds: string[] // non-empty only for venue_staff; empty means "all" for super_admin/support
  isSuperAdmin: boolean
  isSupport: boolean
  isVenueStaff: boolean
}

// Discriminated result for session loading.  Three states:
//   - { ok: true, session }      — authenticated and we know the role
//   - { ok: false, kind: 'unauthenticated' } — no JWT, redirect to /auth/login
//   - { ok: false, kind: 'unavailable' }     — JWT looks fine but role/venue
//                                              lookup failed transiently;
//                                              caller should render a soft
//                                              error page instead of redirect-
//                                              looping back to login.
export type SessionResult =
  | { ok: true; session: UserSession }
  | { ok: false; kind: 'unauthenticated' }
  | { ok: false; kind: 'unavailable'; error: string }

// Loose UUID v4 shape — matches what Supabase issues for `auth.uid()`.
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Detailed loader.  Use this in pages that want to differentiate
// "logged out" from "DB transient error" — pages can render a soft
// error page instead of redirect-looping to login on a flaky DB.
//
// Wrapped in React's `cache()` so multiple callers in the same request
// (layout + page + DashboardShell + every getSession() invocation in
// nested RSCs) share a single round-trip.  Per-request only — does
// NOT persist across requests, so role changes are still observed on
// the next navigation.  CLAUDE.md is explicit on this trade-off.
export const loadSession = cache(async (): Promise<SessionResult> => {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) {
    return { ok: false, kind: 'unauthenticated' }
  }

  const sub = data.claims.sub
  if (typeof sub !== 'string' || !UUID_RX.test(sub)) {
    console.warn('[loadSession] auth.getClaims().sub is malformed; treating as unauthenticated')
    return { ok: false, kind: 'unauthenticated' }
  }
  const userId = sub

  const { data: roleRows, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)

  if (roleError) {
    console.error('[loadSession] failed to fetch user_roles:', roleError.message)
    // JWT is valid; only the role lookup failed.  Distinct kind so caller
    // can render a soft error rather than bouncing back to login (which
    // would re-issue the same query and loop).
    return { ok: false, kind: 'unavailable', error: roleError.message }
  }

  const roles = (roleRows ?? []).map((r) => r.role as AppRole)

  let role: AppRole = 'venue_staff'
  if (roles.includes('super_admin')) role = 'super_admin'
  else if (roles.includes('support')) role = 'support'

  const isSuperAdmin = role === 'super_admin'
  const isSupport = role === 'support'
  const isVenueStaff = role === 'venue_staff'

  let venueIds: string[] = []
  if (isVenueStaff) {
    const { data: assignments, error: assignError } = await supabase
      .from('venue_user_assignments')
      .select('venue_id')
      .eq('user_id', userId)

    if (assignError) {
      console.error('[loadSession] failed to fetch venue_user_assignments:', assignError.message)
      return { ok: false, kind: 'unavailable', error: assignError.message }
    }
    venueIds = (assignments ?? []).map((a) => String(a.venue_id))
  }

  return {
    ok: true,
    session: { userId, role, venueIds, isSuperAdmin, isSupport, isVenueStaff },
  }
})

// Backward-compat: most callers still want "session or null", treating
// transient errors as null (redirect to login).  New callers that care
// about the difference should use `loadSession()` directly.  Both share
// the same per-request cache via `loadSession`.
export async function getSession(): Promise<UserSession | null> {
  const result = await loadSession()
  return result.ok ? result.session : null
}

/** Checks if the session can access a given venue */
export function canAccessVenue(session: UserSession, venueId: string | number): boolean {
  if (session.isSuperAdmin || session.isSupport) return true
  return session.venueIds.includes(String(venueId))
}
