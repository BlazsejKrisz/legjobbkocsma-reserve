import { getSession, canAccessVenue } from '@/lib/auth/getSession'
import { err } from '@/lib/api/http'
import type { UserSession } from '@/lib/auth/getSession'
import { VenueId } from '@/lib/types/ids'

type AuthzOk = { ok: true; session: UserSession }
type AuthzFail = { ok: false; response: ReturnType<typeof err> }
// Returned by requireVenueAccess when the path param parses correctly.
// Surfaces the validated VenueId so route handlers can pass it to typed
// data fetchers without re-parsing.  Adopting the brand is opt-in: the
// existing AuthzOk shape is unchanged for back-compat.
type VenueAuthzOk = AuthzOk & { venueId: VenueId }
type VenueAuthzResult = VenueAuthzOk | AuthzFail

export async function requireAuth(): Promise<AuthzOk | AuthzFail> {
  const session = await getSession()
  if (!session) {
    return { ok: false, response: err('Unauthorized', { status: 401 }) }
  }
  return { ok: true, session }
}

export async function requireSuperAdmin(): Promise<AuthzOk | AuthzFail> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  if (!auth.session.isSuperAdmin) {
    return { ok: false, response: err('Forbidden', { status: 403 }) }
  }
  return auth
}

export async function requireSupportOrAbove(): Promise<AuthzOk | AuthzFail> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  if (auth.session.isVenueStaff) {
    return { ok: false, response: err('Forbidden', { status: 403 }) }
  }
  return auth
}

// Validates the path param as a VenueId (must be a positive integer
// string), then enforces the caller has access to that venue.  Returns
// the branded id so the handler can pass it to typed data fetchers
// without re-parsing.  Invalid id → 404 (not 403) to avoid leaking
// venue-existence via distinct status codes.
export async function requireVenueAccess(rawVenueId: string): Promise<VenueAuthzResult> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const venueId = VenueId.safeParse(rawVenueId)
  if (!venueId) {
    return { ok: false, response: err('Not found', { status: 404 }) }
  }

  if (!canAccessVenue(auth.session, venueId)) {
    return { ok: false, response: err('Forbidden', { status: 403 }) }
  }
  return { ok: true, session: auth.session, venueId }
}
