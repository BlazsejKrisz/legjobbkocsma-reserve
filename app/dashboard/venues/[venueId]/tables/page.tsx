import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getSession, canAccessVenue } from '@/lib/auth/getSession'
import { getVenue } from '@/lib/data/venues'
import { Button } from '@/components/ui/button'
import { TablesList } from '@/components/tables/TablesList'
import { PageHeader } from '@/components/layout/PageHeader'
import { getServerT } from '@/lib/i18n/serverT'

type Params = { params: Promise<{ venueId: string }> }

export default async function TablesPage({ params }: Params) {
  const [{ venueId }, session] = await Promise.all([params, getSession()])
  if (!session) redirect('/auth/login')
  if (!canAccessVenue(session, venueId)) redirect('/dashboard')

  const [venue, t] = await Promise.all([getVenue(venueId), getServerT()])
  if (!venue) notFound()

  const canManageTypes = session.isSuperAdmin || session.isSupport

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.tables.title}
        subtitle={venue.name}
        backHref={`/dashboard/venues/${venueId}`}
        backLabel={venue.name}
        actions={
          canManageTypes ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/venues/${venueId}/table-types`}>
                {t.tables.manage_table_types}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <TablesList venueId={venueId} />
    </div>
  )
}
