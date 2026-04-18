import { createClient } from '@/lib/supabase/server'
import type { Table, TableType } from '@/lib/types/table'

export async function listTablesByVenue(venueId: string): Promise<Table[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tables')
    .select('*, table_types (id, name, code, is_active)')
    .eq('venue_id', venueId)
    .order('sort_order')
    .order('name')

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Table[]
}

export async function listTableTypesByVenue(_venueId: string): Promise<TableType[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('table_types')
    .select('id, name, code, is_active, created_at')
    .order('name')

  if (error) throw new Error(error.message)
  return (data ?? []) as TableType[]
}
