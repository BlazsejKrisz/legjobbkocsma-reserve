export type VenueGroupMember = {
  id: string
  group_id: string
  venue_id: string
  priority: number
  venues: { id: string; name: string } | null
}

export type VenueGroup = {
  id: string
  name: string
  created_at: string
  venue_group_members: VenueGroupMember[]
}

export type AvailableTable = {
  table_id: string
  table_name: string
  sort_order: number
  blend_group: string | null
  can_blend: boolean
  area: string | null
  capacity_min: number
  capacity_max: number
  is_free: boolean
  can_fit: boolean
}
