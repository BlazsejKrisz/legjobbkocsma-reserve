import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { getVenue } from '@/lib/data/venues'
import { VenueSettingsTabs } from '@/components/venues/VenueSettingsTabs'
import { PageHeader } from '@/components/layout/PageHeader'
import { getServerT } from '@/lib/i18n/serverT'

type Params = { params: Promise<{ venueId: string }> }

export default async function VenueSettingsPage({ params }: Params) {
  const [{ venueId }, session, t] = await Promise.all([
    params,
    getSession(),
    getServerT(),
  ])
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin) redirect(`/dashboard/venues/${venueId}`)

  const venue = await getVenue(venueId)
  if (!venue) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.venue_nav.settings}
        subtitle={venue.name}
        backHref={`/dashboard/venues/${venueId}`}
        backLabel={venue.name}
      />
      <VenueSettingsTabs venueId={venueId} />
    </div>
  )
}
