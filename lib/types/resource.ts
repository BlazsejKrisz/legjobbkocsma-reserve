export type ResourceType = {
  id: string
  name: string
}

export type Resource = {
  id: string
  venue_id: string
  resource_type_id: string | null
  name: string
  area: string | null
  capacity_min: number
  capacity_max: number
  is_active: boolean
  sort_order: number
  map_x: number | null
  map_y: number | null
  created_at: string
  // Joined
  resource_types: ResourceType | null
}
