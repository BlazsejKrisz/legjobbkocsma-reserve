import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { VenueList } from '@/components/venues/VenueList'


export default async function VenuesPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')

  if (session.isVenueStaff) redirect('/dashboard')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Venues</h1>
        <p className="text-sm text-muted-foreground">Manage your venues</p>
      </div>

      <VenueList isSuperAdmin={session.isSuperAdmin} />
    </div>
  )
}
