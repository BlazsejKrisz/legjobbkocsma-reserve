import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { VenueGroupsManager } from '@/components/venues/VenueGroupsManager'
import { getServerT } from '@/lib/i18n/serverT'

export default async function VenueGroupsPage() {
  const [session, t] = await Promise.all([getSession(), getServerT()])
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin) redirect('/dashboard')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">{t.nav.venue_groups}</h1>
        <p className="text-sm text-muted-foreground">{t.venue_groups.desc}</p>
      </div>
      <VenueGroupsManager />
    </div>
  )
}
