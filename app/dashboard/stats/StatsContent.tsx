import Link from 'next/link'
import dynamic from 'next/dynamic'
import { format, parseISO, subDays } from 'date-fns'
import { CalendarRange, ArrowRight, Inbox } from 'lucide-react'
import {
  getDailyStats,
  getSourceStats,
  getVenueStats,
  getDowStats,
  getHodStats,
  getLeadTimeStats,
  type DailyStatRow,
} from '@/lib/data/stats'
import { getServerT } from '@/lib/i18n/serverT'
import { StatCard } from '@/components/layout/StatCard'

// Recharts is ~150 KB gzipped; deferred via next/dynamic so it stays
// out of the shared dashboard bundle.
const StatsCharts = dynamic(
  () => import('@/components/dashboard/StatsCharts').then((m) => ({ default: m.StatsCharts })),
  { loading: () => null },
)

type Props = {
  fromStr: string
  toStr: string
  days: number
  venueId: number | null
}

// Heavy server component — runs the 6 RPCs in parallel.  Wrapped in
// <Suspense> by the parent page so the header + filters render
// immediately while this streams in.
export async function StatsContent({ fromStr, toStr, days, venueId }: Props) {
  const t = await getServerT()

  const [daily, sources, venues, dow, hod, leadTime] = await Promise.all([
    getDailyStats({ fromStr, toStr, venueId }),
    getSourceStats({ fromStr, toStr, venueId }),
    getVenueStats({ fromStr, toStr }),
    getDowStats({ fromStr, toStr, venueId }),
    getHodStats({ fromStr, toStr, venueId }),
    getLeadTimeStats({ fromStr, toStr, venueId }),
  ])

  // Pad daily series so the chart shows zeros for days with no bookings.
  const rangeStart = parseISO(fromStr)
  const dailyMap = new Map<string, DailyStatRow>(daily.map((r) => [r.day, r]))
  const dailySeries = Array.from({ length: days }, (_, i) => {
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

  const totalGuests = dailySeries.reduce((s, d) => s + d.total_guests, 0)
  const total = dailySeries.reduce((s, d) => s + d.total, 0)
  const completed = dailySeries.reduce((s, d) => s + d.completed, 0)
  const cancelled = dailySeries.reduce((s, d) => s + d.cancelled, 0)
  const overflow = dailySeries.reduce((s, d) => s + d.overflow, 0)
  const completionRate = total > 0
    ? Math.round((completed / Math.max(1, total - overflow)) * 100)
    : 0

  // Auto-fallback empty state.  When the selected range has zero
  // reservations, we don't want to render six identical "no data"
  // chart placeholders — they look like the page is broken.  Instead
  // we surface one clear, branded empty state with a direct action
  // (try the broader 90-day range).
  if (total === 0) {
    return (
      <div className="rounded-xl border border-border/80 bg-card p-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 ring-1 ring-inset ring-border/60">
          <Inbox className="h-5 w-5 text-muted-foreground/70" strokeWidth={1.75} />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          {t.stats.empty_title}
        </h2>
        <p className="mt-1 max-w-md mx-auto text-[13px] text-muted-foreground">
          {t.stats.empty_description}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            href={
              venueId
                ? `/dashboard/stats?range=90d&venue_id=${venueId}`
                : `/dashboard/stats?range=90d`
            }
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3.5 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50"
          >
            <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} />
            {t.stats.empty_try_90d}
            <ArrowRight className="h-3 w-3" />
          </Link>
          <Link
            href="/dashboard/reservations"
            className="inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t.stats.empty_browse_reservations}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    )
  }

  // Refined summary cards — same visual rhythm as the dashboard
  // overview stats.  Each card uses the new semantic CSS tokens so
  // tone changes are token-driven rather than hardcoded.
  const summaryCards: Array<{
    label: string
    value: number
    hint: string
    tone: 'brand' | 'success' | 'warning' | 'destructive' | 'default'
  }> = [
    { label: t.stats.total_reservations, value: total, hint: t.stats.total_reservations_hint, tone: 'brand' },
    { label: t.stats.total_guests, value: totalGuests, hint: t.stats.total_guests_hint, tone: 'default' },
    { label: t.stats.completed, value: completed, hint: t.stats.completed_hint, tone: 'success' },
    { label: t.stats.cancelled, value: cancelled, hint: t.stats.cancelled_hint, tone: 'destructive' },
  ]

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaryCards.map(({ label, value, hint, tone }) => (
          <StatCard
            key={label}
            tone={tone}
            label={label}
            value={value.toLocaleString()}
            hint={hint}
          />
        ))}
      </div>

      <StatsCharts
        daily={dailySeries}
        sources={sources}
        venues={venues}
        dow={dow}
        hod={hod}
        leadTime={leadTime}
        completionRate={completionRate}
      />
    </>
  )
}

export function StatsContentFallback() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border/80 bg-card p-4"
        >
          <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          <div className="mt-2 h-8 w-16 rounded bg-muted animate-pulse" />
          <div className="mt-2 h-2 w-32 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  )
}
