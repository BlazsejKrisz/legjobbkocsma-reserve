import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { listVenues } from '@/lib/data/venues'
import { getServerT } from '@/lib/i18n/serverT'
import { AvailabilityChecker } from '@/components/availability/AvailabilityChecker'
import { PageHeader } from '@/components/layout/PageHeader'

export default async function AvailabilityPage() {
  const [session, t] = await Promise.all([getSession(), getServerT()])
  if (!session) redirect('/auth/login')
  if (session.isVenueStaff) redirect('/dashboard')

  const venues = await listVenues(session)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.availability.title} subtitle={t.availability.subtitle} />
      <AvailabilityChecker venues={venues} />
    </div>
  )
}
