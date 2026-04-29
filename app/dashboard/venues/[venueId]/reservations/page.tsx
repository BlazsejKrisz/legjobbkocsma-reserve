import { redirect, notFound } from 'next/navigation'
import { getSession, canAccessVenue } from '@/lib/auth/getSession'
import { getVenue } from '@/lib/data/venues'
import { listTableTypesByVenue } from '@/lib/data/tables'
import { ReservationsList } from '@/components/reservations/ReservationsList'

type Params = { params: Promise<{ venueId: string }> }

export default async function VenueReservationsPage({ params }: Params) {
  const { venueId } = await params
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!canAccessVenue(session, venueId)) redirect('/dashboard')

  const venue = await getVenue(venueId)
  if (!venue) notFound()

  const tableTypes = await listTableTypesByVenue(venueId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{venue.name}</h1>
        <p className="mt-0.5 text-xs font-mono text-muted-foreground">{venue.slug}</p>
      </div>

      <ReservationsList
        venues={[venue]}
        tableTypes={tableTypes}
        defaultVenueId={venueId}
      />
    </div>
  )
}
