import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { VenueList } from '@/components/venues/VenueList'
import { getServerT } from '@/lib/i18n/serverT'

export default async function VenuesPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')

  if (session.isVenueStaff) redirect('/dashboard')

  const t = await getServerT()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">{t.venues.title}</h1>
        <p className="text-sm text-muted-foreground">{t.venues.subtitle}</p>
      </div>

      <VenueList isSuperAdmin={session.isSuperAdmin} />
    </div>
  )
}
