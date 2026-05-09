import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { VenueList } from '@/components/venues/VenueList'
import { PageHeader } from '@/components/layout/PageHeader'
import { getServerT } from '@/lib/i18n/serverT'

export default async function VenuesPage() {
  const [session, t] = await Promise.all([getSession(), getServerT()])
  if (!session) redirect('/auth/login')
  if (session.isVenueStaff) redirect('/dashboard')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.venues.title} subtitle={t.venues.subtitle} />
      <VenueList isSuperAdmin={session.isSuperAdmin} />
    </div>
  )
}
