import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { VenueGroupsManager } from '@/components/venues/VenueGroupsManager'

export default async function VenueGroupsPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin) redirect('/dashboard')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Venue Groups</h1>
        <p className="text-sm text-muted-foreground">
          Group venues together for shared overflow routing with priority ordering.
        </p>
      </div>
      <VenueGroupsManager />
    </div>
  )
}
