import { getSession, canAccessVenue } from '@/lib/auth/getSession'
import { err } from '@/lib/api/http'
import type { UserSession } from '@/lib/auth/getSession'

type AuthzOk = { ok: true; session: UserSession }
type AuthzFail = { ok: false; response: ReturnType<typeof err> }

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

export async function requireVenueAccess(venueId: string): Promise<AuthzOk | AuthzFail> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  if (!canAccessVenue(auth.session, venueId)) {
    return { ok: false, response: err('Forbidden', { status: 403 }) }
  }
  return auth
}
