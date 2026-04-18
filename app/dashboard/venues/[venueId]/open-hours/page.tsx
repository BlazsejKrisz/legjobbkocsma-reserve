import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getSession } from '@/lib/auth/getSession'
import { getVenue } from '@/lib/data/venues'
import { Button } from '@/components/ui/button'
import { OpenHoursEditor } from '@/components/venues/OpenHoursEditor'


type Params = { params: Promise<{ venueId: string }> }

export default async function OpenHoursPage({ params }: Params) {
  const { venueId } = await params
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin) redirect(`/dashboard/venues/${venueId}`)

  const venue = await getVenue(venueId)
  if (!venue) notFound()

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-7" asChild>
          <Link href={`/dashboard/venues/${venueId}`}>
            <ChevronLeft className="h-3.5 w-3.5" />
            {venue.name}
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-lg font-semibold">Open hours</h1>
        <p className="text-sm text-muted-foreground">{venue.name}</p>
      </div>

      <OpenHoursEditor venueId={venueId} />
    </div>
  )
}
