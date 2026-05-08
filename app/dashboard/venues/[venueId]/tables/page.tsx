import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getSession, canAccessVenue } from '@/lib/auth/getSession'
import { getVenue } from '@/lib/data/venues'
import { Button } from '@/components/ui/button'
import { TablesList } from '@/components/tables/TablesList'
import { getServerT } from '@/lib/i18n/serverT'

type Params = { params: Promise<{ venueId: string }> }

export default async function TablesPage({ params }: Params) {
  const [{ venueId }, session] = await Promise.all([params, getSession()])
  if (!session) redirect('/auth/login')
  if (!canAccessVenue(session, venueId)) redirect('/dashboard')

  const [venue, t] = await Promise.all([getVenue(venueId), getServerT()])
  if (!venue) notFound()

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-7" asChild>
          <Link href={`/dashboard/venues/${venueId}`}>
            <ChevronLeft className="h-3.5 w-3.5" />
            {venue.name}
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{t.tables.title}</h1>
          <p className="text-sm text-muted-foreground">{venue.name}</p>
        </div>
        {(session.isSuperAdmin || session.isSupport) && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/venues/${venueId}/table-types`}>
              {t.tables.manage_table_types}
            </Link>
          </Button>
        )}
      </div>

      <TablesList venueId={venueId} />
    </div>
  )
}
