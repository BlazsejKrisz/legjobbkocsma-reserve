import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { listVenues } from '@/lib/data/venues'
import { getServerT } from '@/lib/i18n/serverT'
import { AvailabilityChecker } from '@/components/availability/AvailabilityChecker'

export default async function AvailabilityPage() {
  const [session, t] = await Promise.all([getSession(), getServerT()])
  if (!session) redirect('/auth/login')
  if (session.isVenueStaff) redirect('/dashboard')

  const venues = await listVenues(session)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">{t.availability.title}</h1>
        <p className="text-sm text-muted-foreground">{t.availability.subtitle}</p>
      </div>

      <AvailabilityChecker venues={venues} />
    </div>
  )
}
