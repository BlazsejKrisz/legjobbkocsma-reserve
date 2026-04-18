export type TableTypeCode =
  | 'standard'
  | 'billiard'
  | 'darts'
  | 'vip'
  | 'other'

export type TableType = {
  id: string
  name: string
  code: TableTypeCode
  is_active: boolean
  created_at: string
}

export type Table = {
  id: string
  venue_id: string
  table_type_id: string | null
  name: string
  area: string | null
  capacity_min: number
  capacity_max: number
  sort_order: number
  blend_group: string | null
  can_blend: boolean
  is_active: boolean
  map_x: number | null
  map_y: number | null
  created_at: string
  // Joined
  table_types: TableType | null
}

export type ReservationTable = {
  id: string
  reservation_id: string
  table_id: string
  released_at: string | null
  // Joined
  tables: Pick<Table, 'id' | 'name' | 'area' | 'capacity_min' | 'capacity_max'> | null
}
