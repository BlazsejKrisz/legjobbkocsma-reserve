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

export async function getSession(): Promise<UserSession | null> {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return null

  const userId = data.claims.sub as string

  // Fetch primary role (a user may have one role; highest privilege wins if multiple)
  const { data: roleRows, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)

  if (roleError) {
    console.error('[getSession] failed to fetch user_roles:', roleError)
    throw new Error(roleError.message)
  }

  const roles = (roleRows ?? []).map((r) => r.role as AppRole)

  // Role priority: super_admin > support > venue_staff
  let role: AppRole = 'venue_staff'
  if (roles.includes('super_admin')) role = 'super_admin'
  else if (roles.includes('support')) role = 'support'

  const isSuperAdmin = role === 'super_admin'
  const isSupport = role === 'support'
  const isVenueStaff = role === 'venue_staff'

  // For venue_staff, load their assigned venue IDs
  let venueIds: string[] = []
  if (isVenueStaff) {
    const { data: assignments, error: assignError } = await supabase
      .from('venue_user_assignments')
      .select('venue_id')
      .eq('user_id', userId)

    if (assignError) {
      console.error('[getSession] failed to fetch venue_user_assignments:', assignError)
      throw new Error(assignError.message)
    }
    venueIds = (assignments ?? []).map((a) => String(a.venue_id))
  }

  return { userId, role, venueIds, isSuperAdmin, isSupport, isVenueStaff }
}

/** Checks if the session can access a given venue */
export function canAccessVenue(session: UserSession, venueId: string | number): boolean {
  if (session.isSuperAdmin || session.isSupport) return true
  return session.venueIds.includes(String(venueId))
}
