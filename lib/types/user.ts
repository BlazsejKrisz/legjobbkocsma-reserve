export type AppRole = 'super_admin' | 'support' | 'venue_staff'

export type UserProfile = {
  id: string
  full_name: string | null
  email: string | null
  is_active: boolean
  created_at: string
}

export type UserRole = {
  id: string
  user_id: string
  role: AppRole
}

export type VenueUserAssignment = {
  id: string
  venue_id: string
  user_id: string
  created_at: string
}

// Combined view used in the users management page
export type UserWithRolesAndVenues = UserProfile & {
  roles: AppRole[]
  venue_ids: string[]
  venue_names: string[]
}
