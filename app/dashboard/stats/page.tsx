import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getSession } from '@/lib/auth/getSession'
import { listVenues } from '@/lib/data/venues'
import { StatsFilters } from '@/components/dashboard/StatsFilters'
import { subDays, format, parseISO, differenceInDays } from 'date-fns'
import { getServerT } from '@/lib/i18n/serverT'
import { StatsContent, StatsContentFallback } from './StatsContent'

type RangeT = {
  stats: {
    range_7d: string
    range_30d: string
    range_90d: string
    range_upcoming: string
    range_around: string
  }
}

function resolveRange(
  range: string | null,
  from: string | null,
  to: string | null,
  t: RangeT,
): { fromStr: string; toStr: string; days: number; label: string } {
  const today = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

  if (range === 'custom' && from && to) {
    const days = differenceInDays(parseISO(to), parseISO(from)) + 1
    return { fromStr: from, toStr: to, days, label: `${from} → ${to}` }
  }
  if (range === '90d') {
    return { fromStr: fmt(subDays(today, 89)), toStr: fmt(today), days: 90, label: t.stats.range_90d }
  }
  if (range === '7d') {
    return { fromStr: fmt(subDays(today, 6)), toStr: fmt(today), days: 7, label: t.stats.range_7d }
  }
  if (range === 'upcoming') {
    return {
      fromStr: fmt(today),
      toStr: fmt(subDays(today, -29)),
      days: 30,
      label: t.stats.range_upcoming,
    }
  }
  if (range === 'around') {
    return {
      fromStr: fmt(subDays(today, 6)),
      toStr: fmt(subDays(today, -23)),
      days: 30,
      label: t.stats.range_around,
    }
  }
  // Default: last 30 days.  Most universally meaningful — captures
  // recent activity for any system that has been running for a while.
  // Old default ("past 7 + next 23") missed data for systems whose
  // bookings are mostly in the past, leaving the page looking empty.
  return {
    fromStr: fmt(subDays(today, 29)),
    toStr: fmt(today),
    days: 30,
    label: t.stats.range_30d,
  }
}

type SearchParams = Promise<{ range?: string; from?: string; to?: string; venue_id?: string }>

export default async function StatsPage({ searchParams }: { searchParams: SearchParams }) {
  // Header + filters come back fast (just session + venues list).  The
  // expensive 6-RPC fan-out is split into <StatsContent /> below and
  // wrapped in <Suspense> so the page paints the chrome immediately
  // and streams the chart grid in once data arrives.
  const [session, sp, t] = await Promise.all([getSession(), searchParams, getServerT()])
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin && !session.isSupport) redirect('/dashboard')

  const { fromStr, toStr, days, label } = resolveRange(
    sp.range ?? null,
    sp.from ?? null,
    sp.to ?? null,
    t,
  )
  const venueId = sp.venue_id ? Number(sp.venue_id) : null
  const venues = await listVenues(session)
  const selectedVenueName =
    venueId !== null ? venues.find((v) => v.id === String(venueId))?.name : null

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t.stats.title}</h1>
        <p className="text-sm text-muted-foreground">{t.stats.subtitle}</p>
      </div>

      <Suspense>
        <StatsFilters venues={venues.map((v) => ({ id: v.id, name: v.name }))} />
      </Suspense>

      <p className="text-xs text-muted-foreground -mt-3 flex items-center gap-1.5">
        <span className="text-muted-foreground/60">{t.common.showing}</span>
        <span className="font-medium text-foreground">{label}</span>
        {selectedVenueName && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="font-medium text-foreground">{selectedVenueName}</span>
          </>
        )}
      </p>

      <Suspense fallback={<StatsContentFallback />}>
        <StatsContent fromStr={fromStr} toStr={toStr} days={days} venueId={venueId} />
      </Suspense>
    </div>
  )
}
