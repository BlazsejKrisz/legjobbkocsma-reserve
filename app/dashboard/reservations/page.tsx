import { getSession } from '@/lib/auth/getSession'
import { listVenues } from '@/lib/data/venues'
import { ReservationsList } from '@/components/reservations/ReservationsList'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { TableType } from '@/lib/types/table'

async function listAllTableTypes(): Promise<TableType[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('table_types')
    .select('id, name, code, is_active, created_at')
    .eq('is_active', true)
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as TableType[]
}

export default async function ReservationsPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')

  const [venues, tableTypes] = await Promise.all([
    listVenues(session),
    listAllTableTypes(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reservations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All reservations across venues. Use the date presets or custom range to narrow the list,
          filter by status or source, or search by customer name. Click any row to view full details
          and make changes.
        </p>
      </div>

      <ReservationsList
        venues={venues}
        tableTypes={tableTypes}
        showVenueColumn={venues.length > 1}
      />
    </div>
  )
}
