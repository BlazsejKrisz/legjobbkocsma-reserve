import { ok, dbErr } from '@/lib/api/http'
import { requireSuperAdmin } from '@/lib/api/authz'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const supabase = await createClient()

  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, is_active, created_at')
    .order('full_name')

  if (profilesError) return dbErr(profilesError, 'fetch user_profiles')
  if (!profiles || profiles.length === 0) return ok({ data: [] })

  const userIds = profiles.map((p) => p.id)

  const [{ data: roles, error: rolesError }, { data: assignments, error: assignError }] =
    await Promise.all([
      supabase.from('user_roles').select('user_id, role').in('user_id', userIds),
      supabase
        .from('venue_user_assignments')
        .select('user_id, venue_id, venues (name)')
        .in('user_id', userIds),
    ])

  if (rolesError) return dbErr(rolesError, 'fetch user_roles')
  if (assignError) return dbErr(assignError, 'fetch venue_user_assignments')

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

  const data = profiles.map((p) => ({
    ...p,
    roles: rolesByUser.get(p.id) ?? [],
    venue_ids: (venuesByUser.get(p.id) ?? []).map((v) => v.id),
    venue_names: (venuesByUser.get(p.id) ?? []).map((v) => v.name),
  }))

  return ok({ data })
}
