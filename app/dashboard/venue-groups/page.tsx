import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { VenueGroupsManager } from '@/components/venues/VenueGroupsManager'
import { PageHeader } from '@/components/layout/PageHeader'
import { getServerT } from '@/lib/i18n/serverT'

export default async function VenueGroupsPage() {
  const [session, t] = await Promise.all([getSession(), getServerT()])
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin) redirect('/dashboard')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.nav.venue_groups} subtitle={t.venue_groups.desc} />
      <VenueGroupsManager />
    </div>
  )
}
