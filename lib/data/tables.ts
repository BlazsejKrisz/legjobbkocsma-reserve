import { cacheLife, cacheTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import type { Table, TableType } from '@/lib/types/table'
import { tags } from './cacheTags'

// Cached: tables list per venue.  Mutation routes for tables call
// `revalidateTag(tags.tables.byVenue(venueId))`.  Uses admin client so
// it can be cached without RLS-induced per-user fragmentation; the
// page-level auth check restricts who can hit the endpoint.
export async function listTablesByVenue(venueId: string): Promise<Table[]> {
  'use cache'
  cacheLife('minutes')
  cacheTag(tags.tables.byVenue(venueId))
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tables')
    .select('*, table_types (id, name, code, is_active)')
    .eq('venue_id', venueId)
    .order('sort_order')
    .order('name')

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Table[]
}

// table_types is a global lookup table — the function ignores venueId.
// Renamed callers should switch to listAllTableTypes().  Kept under
// the old name for callsite compatibility.
//
// `_venueId` underscore-prefixed so eslint accepts the unused param;
// signature retained for binary-compat with existing callers.
export async function listTableTypesByVenue(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _venueId: string,
): Promise<TableType[]> {
  return listAllTableTypes()
}

// Truly global — table_types has no per-venue scoping.  Long cache
// life since rows change rarely (admin-only management).
export async function listAllTableTypes(): Promise<TableType[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(tags.tableTypes.all())
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('table_types')
    .select('id, name, code, is_active, created_at')
    .order('name')

  if (error) throw new Error(error.message)
  return (data ?? []) as TableType[]
}
