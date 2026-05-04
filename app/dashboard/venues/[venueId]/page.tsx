import { redirect, notFound } from 'next/navigation'
import { getSession, canAccessVenue } from '@/lib/auth/getSession'
import { getVenue } from '@/lib/data/venues'
import { listTableTypesByVenue } from '@/lib/data/tables'
import { TimelineView } from '@/components/dashboard/TimelineView'
import { VenueSwitcher } from '@/components/dashboard/VenueSwitcher'
import { createAdminClient } from '@/lib/supabase/server'
import type { Venue } from '@/lib/types/venue'

type Params = { params: Promise<{ venueId: string }> }

async function listAllVenues(): Promise<Venue[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, slug, is_active, created_at')
    .order('name')
  if (error) return []
  return (data ?? []) as Venue[]
}

export default async function VenueTimelinePage({ params }: Params) {
  const { venueId } = await params
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!canAccessVenue(session, venueId)) redirect('/dashboard')

  const [venue, tableTypes, allVenues] = await Promise.all([
    getVenue(venueId),
    listTableTypesByVenue(venueId),
    session.isVenueStaff ? Promise.resolve([]) : listAllVenues(),
  ])
  if (!venue) notFound()

  const venueOptions = allVenues.map((v) => ({ id: String(v.id), name: v.name }))
  const canSwitch = !session.isVenueStaff && venueOptions.length > 1

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-semibold tracking-tight">{venue.name}</h1>
        {canSwitch && (
          <VenueSwitcher currentId={String(venue.id)} venues={venueOptions} />
        )}
        {session.isSuperAdmin && (
          <span className="text-xs font-mono text-muted-foreground/60">{venue.slug}</span>
        )}
      </div>

      <TimelineView
        venueId={venueId}
        venues={[venue]}
        tableTypes={tableTypes}
      />
    </div>
  )
}
