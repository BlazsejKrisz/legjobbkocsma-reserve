import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getSession } from '@/lib/auth/getSession'
import { createClient } from '@/lib/supabase/server'
import { listVenues } from '@/lib/data/venues'
import { StatsCharts } from '@/components/dashboard/StatsCharts'
import { StatsFilters } from '@/components/dashboard/StatsFilters'
import { subDays, format, parseISO, differenceInDays } from 'date-fns'

// Resolve date range from URL search params
function resolveRange(
  range: string | null,
  from: string | null,
  to: string | null,
): { fromStr: string; toStr: string; days: number; label: string } {
  const today = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

  if (range === 'custom' && from && to) {
    const days = differenceInDays(parseISO(to), parseISO(from)) + 1
    return { fromStr: from, toStr: to, days, label: `${from} → ${to}` }
  }
  if (range === '90d') {
    return {
      fromStr: fmt(subDays(today, 89)),
      toStr: fmt(today),
      days: 90,
      label: 'Last 90 days',
    }
  }
  if (range === '7d') {
    return {
      fromStr: fmt(subDays(today, 6)),
      toStr: fmt(today),
      days: 7,
      label: 'Last 7 days',
    }
  }
  // default: 30d
  return {
    fromStr: fmt(subDays(today, 29)),
    toStr: fmt(today),
    days: 30,
    label: 'Last 30 days',
  }
}

type SearchParams = Promise<{ range?: string; from?: string; to?: string; venue_id?: string }>

export default async function StatsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin && !session.isSupport) redirect('/dashboard')

  const sp = await searchParams
  const { fromStr, toStr, days, label } = resolveRange(
    sp.range ?? null,
    sp.from ?? null,
    sp.to ?? null,
  )
  const venueId = sp.venue_id ? Number(sp.venue_id) : null

  const supabase = await createClient()

  const [dailyResult, sourceResult, venueResult, venues] = await Promise.all([
    supabase.rpc('get_reservation_stats', {
      p_from: fromStr,
      p_to: toStr,
      ...(venueId ? { p_venue_id: venueId } : {}),
    }),
    supabase.rpc('get_source_stats', {
      p_from: fromStr,
      p_to: toStr,
      ...(venueId ? { p_venue_id: venueId } : {}),
    }),
    supabase.rpc('get_venue_stats', { p_from: fromStr, p_to: toStr }),
    listVenues(session),
  ])

  // Build full day series (fill in missing days with zeros)
  const rangeStart = parseISO(fromStr)
  const dailyMap = new Map(
    (dailyResult.data ?? []).map((r: {
      day: string; total: number; confirmed: number; cancelled: number;
      no_show: number; completed: number; overflow: number; total_guests: number
    }) => [r.day, r]),
  )

  const daily = Array.from({ length: days }, (_, i) => {
    const d = format(subDays(rangeStart, -i), 'yyyy-MM-dd')
    const row = dailyMap.get(d)
    return {
      day: d,
      total: row?.total ?? 0,
      confirmed: row?.confirmed ?? 0,
      cancelled: row?.cancelled ?? 0,
      no_show: row?.no_show ?? 0,
      completed: row?.completed ?? 0,
      overflow: row?.overflow ?? 0,
      total_guests: row?.total_guests ?? 0,
    }
  })

  const totalGuests = daily.reduce((s, d) => s + d.total_guests, 0)
  const total = daily.reduce((s, d) => s + d.total, 0)
  const completed = daily.reduce((s, d) => s + d.completed, 0)
  const cancelled = daily.reduce((s, d) => s + d.cancelled, 0)
  const overflow = daily.reduce((s, d) => s + d.overflow, 0)
  const completionRate = total > 0
    ? Math.round((completed / Math.max(1, total - overflow)) * 100)
    : 0

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">Statistics</h1>
        <p className="text-sm text-muted-foreground">
          Reservation trends, source breakdown, and venue performance.
          Use the filters below to adjust the time range or focus on a single venue.
        </p>
      </div>

      {/* Filter bar — client component, updates URL params */}
      <Suspense>
        <StatsFilters venues={venues.map((v) => ({ id: v.id, name: v.name }))} />
      </Suspense>

      {/* Active range label */}
      <p className="text-xs text-muted-foreground -mt-3">
        Showing: <span className="font-medium text-foreground">{label}</span>
        {venueId && venues.find((v) => v.id === String(venueId)) && (
          <> · {venues.find((v) => v.id === String(venueId))?.name}</>
        )}
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: 'Total reservations',
            value: total,
            hint: 'All reservations in the selected period, regardless of status.',
          },
          {
            label: 'Total guests',
            value: totalGuests,
            hint: 'Sum of party sizes across all reservations.',
          },
          {
            label: 'Completed',
            value: completed,
            hint: 'Reservations marked as completed (guests arrived and seated).',
          },
          {
            label: 'Cancelled',
            value: cancelled,
            hint: 'Reservations cancelled by guest or staff.',
          },
        ].map(({ label, value, hint }) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-card px-4 py-3"
            title={hint}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
            <p className="mt-1 text-[10px] text-muted-foreground/70">{hint}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <StatsCharts
        daily={daily}
        sources={sourceResult.data ?? []}
        venues={venueResult.data ?? []}
        completionRate={completionRate}
      />
    </div>
  )
}
