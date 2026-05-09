import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { getVenue } from '@/lib/data/venues'
import { TableTypesList } from '@/components/tables/TableTypesList'
import { PageHeader } from '@/components/layout/PageHeader'
import { getServerT } from '@/lib/i18n/serverT'

type Params = { params: Promise<{ venueId: string }> }

export default async function TableTypesPage({ params }: Params) {
  const [{ venueId }, session] = await Promise.all([params, getSession()])
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin && !session.isSupport) redirect(`/dashboard/venues/${venueId}`)

  const [venue, t] = await Promise.all([getVenue(venueId), getServerT()])
  if (!venue) notFound()

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <PageHeader
        title={t.table_types.title}
        subtitle={venue.name}
        backHref={`/dashboard/venues/${venueId}/tables`}
        backLabel={t.table_types.back_to_tables}
      />
      <TableTypesList venueId={venueId} />
    </div>
  )
}
