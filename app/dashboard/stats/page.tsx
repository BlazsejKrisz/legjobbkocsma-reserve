import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getSession } from '@/lib/auth/getSession'
import { createAdminClient } from '@/lib/supabase/server'
import { listVenues } from '@/lib/data/venues'
import { StatsCharts } from '@/components/dashboard/StatsCharts'
import { StatsFilters } from '@/components/dashboard/StatsFilters'
import { subDays, format, parseISO, differenceInDays } from 'date-fns'
import { getServerT } from '@/lib/i18n/serverT'

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
    return {
      fromStr: fmt(subDays(today, 89)),
      toStr: fmt(today),
      days: 90,
      label: t.stats.range_90d,
    }
  }
  if (range === '30d') {
    return {
      fromStr: fmt(subDays(today, 29)),
      toStr: fmt(today),
      days: 30,
      label: t.stats.range_30d,
    }
  }
  if (range === '7d') {
    return {
      fromStr: fmt(subDays(today, 6)),
      toStr: fmt(today),
      days: 7,
      label: t.stats.range_7d,
    }
  }
  if (range === 'upcoming') {
    return {
      fromStr: fmt(today),
      toStr: fmt(subDays(today, -29)),
      days: 30,
      label: t.stats.range_upcoming,
    }
  }
  // Default: past 7 + next 23 days.  Catches both recent history and
  // upcoming bookings, so a fresh system isn't empty.
  return {
    fromStr: fmt(subDays(today, 6)),
    toStr: fmt(subDays(today, -23)),
    days: 30,
    label: t.stats.range_around,
  }
}

type SearchParams = Promise<{ range?: string; from?: string; to?: string; venue_id?: string }>
type DailyStatRow = {
  day: string
  total: number
  confirmed: number
  cancelled: number
  no_show: number
  completed: number
  overflow: number
  total_guests: number
}

export default async function StatsPage({ searchParams }: { searchParams: SearchParams }) {
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

  const supabase = createAdminClient()

  const [dailyResult, sourceResult, venueResult, dowResult, hodResult, leadResult, venues] =
    await Promise.all([
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
      supabase.rpc('get_dow_stats', {
        p_from: fromStr,
        p_to: toStr,
        ...(venueId ? { p_venue_id: venueId } : {}),
      }),
      supabase.rpc('get_hod_stats', {
        p_from: fromStr,
        p_to: toStr,
        ...(venueId ? { p_venue_id: venueId } : {}),
      }),
      supabase.rpc('get_lead_time_stats', {
        p_from: fromStr,
        p_to: toStr,
        ...(venueId ? { p_venue_id: venueId } : {}),
      }),
      listVenues(session),
    ])

  const rangeStart = parseISO(fromStr)
  const dailyMap = new Map<string, DailyStatRow>(
    ((dailyResult.data ?? []) as DailyStatRow[]).map((r) => [r.day, r]),
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

  const summaryCards = [
    { label: t.stats.total_reservations, value: total, hint: t.stats.total_reservations_hint },
    { label: t.stats.total_guests, value: totalGuests, hint: t.stats.total_guests_hint },
    { label: t.stats.completed, value: completed, hint: t.stats.completed_hint },
    { label: t.stats.cancelled, value: cancelled, hint: t.stats.cancelled_hint },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">{t.stats.title}</h1>
        <p className="text-sm text-muted-foreground">{t.stats.subtitle}</p>
      </div>

      <Suspense>
        <StatsFilters venues={venues.map((v) => ({ id: v.id, name: v.name }))} />
      </Suspense>

      <p className="text-xs text-muted-foreground -mt-3">
        {t.common.showing} <span className="font-medium text-foreground">{label}</span>
        {venueId && venues.find((v) => v.id === String(venueId)) && (
          <> · {venues.find((v) => v.id === String(venueId))?.name}</>
        )}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaryCards.map(({ label, value, hint }) => (
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

      <StatsCharts
        daily={daily}
        sources={sourceResult.data ?? []}
        venues={venueResult.data ?? []}
        dow={dowResult.data ?? []}
        hod={hodResult.data ?? []}
        leadTime={leadResult.data ?? []}
        completionRate={completionRate}
      />
    </div>
  )
}
