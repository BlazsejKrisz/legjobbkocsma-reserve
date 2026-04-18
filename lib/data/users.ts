import { createClient } from '@/lib/supabase/server'
import type { UserWithRolesAndVenues } from '@/lib/types/user'

export async function listUsers(): Promise<UserWithRolesAndVenues[]> {
  const supabase = await createClient()

  // Fetch profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, is_active, created_at')
    .order('full_name')

  if (profilesError) throw new Error(profilesError.message)
  if (!profiles || profiles.length === 0) return []

  const userIds = profiles.map((p) => p.id)

  // Fetch roles
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', userIds)

  if (rolesError) throw new Error(rolesError.message)

  // Fetch venue assignments with venue names
  const { data: assignments, error: assignError } = await supabase
    .from('venue_user_assignments')
    .select('user_id, venue_id, venues (name)')
    .in('user_id', userIds)

  if (assignError) throw new Error(assignError.message)

  // Build lookup maps
  const rolesByUser = new Map<string, string[]>()
  for (const r of roles ?? []) {
    if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, [])
    rolesByUser.get(r.user_id)!.push(r.role)
  }

  const venuesByUser = new Map<string, { id: string; name: string }[]>()
  for (const a of assignments ?? []) {
    if (!venuesByUser.has(a.user_id)) venuesByUser.set(a.user_id, [])
    venuesByUser.get(a.user_id)!.push({
      id: a.venue_id,
      // @ts-expect-error supabase join shape
      name: a.venues?.name ?? a.venue_id,
    })
  }

  return profiles.map((p) => ({
    ...p,
    roles: (rolesByUser.get(p.id) ?? []) as UserWithRolesAndVenues['roles'],
    venue_ids: (venuesByUser.get(p.id) ?? []).map((v) => v.id),
    venue_names: (venuesByUser.get(p.id) ?? []).map((v) => v.name),
  }))
}
