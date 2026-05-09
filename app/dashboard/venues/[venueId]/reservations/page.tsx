import { redirect, notFound } from 'next/navigation'
import { getSession, canAccessVenue } from '@/lib/auth/getSession'
import { getVenue } from '@/lib/data/venues'
import { listTableTypesByVenue } from '@/lib/data/tables'
import { ReservationsList } from '@/components/reservations/ReservationsList'
import { PageHeader } from '@/components/layout/PageHeader'

type Params = { params: Promise<{ venueId: string }> }

export default async function VenueReservationsPage({ params }: Params) {
  const [{ venueId }, session] = await Promise.all([params, getSession()])
  if (!session) redirect('/auth/login')
  if (!canAccessVenue(session, venueId)) redirect('/dashboard')

  const [venue, tableTypes] = await Promise.all([getVenue(venueId), listTableTypesByVenue(venueId)])
  if (!venue) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={venue.name}
        subtitle={venue.slug}
        backHref={`/dashboard/venues/${venueId}`}
        backLabel={venue.name}
      />
      <ReservationsList
        venues={[venue]}
        tableTypes={tableTypes}
        defaultVenueId={venueId}
      />
    </div>
  )
}
