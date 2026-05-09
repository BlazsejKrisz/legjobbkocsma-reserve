import { createClient } from '@/lib/supabase/server'
import { CalendarDays, Users, AlertTriangle, TrendingUp } from 'lucide-react'
import { addDays, subDays, format } from 'date-fns'
import { getServerT } from '@/lib/i18n/serverT'
import type { UserSession } from '@/lib/auth/getSession'
import { StatCard } from '@/components/layout/StatCard'

// Top-of-dashboard stat grid.  Uses the shared StatCard primitive so
// trend chips, hints, and tone styling are consistent with the stats
// page summary cards and the notifications dashboard quick-stats strip.
export async function OverviewStats(props: { session: UserSession }) {
  void props
  const [supabase, t] = await Promise.all([createClient(), getServerT()])

  const today = new Date()
  const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999)
  const yesterdayStart = subDays(todayStart, 1)
  const yesterdayEnd = subDays(todayEnd, 1)
  const tomorrowStart = addDays(todayStart, 1)
  const tomorrowEnd = addDays(todayEnd, 1)
  const week7Start = subDays(todayStart, 6)

  const from7 = format(week7Start, 'yyyy-MM-dd')
  const to7   = format(today, 'yyyy-MM-dd')

  const [
    todayResult,
    yesterdayResult,
    todayConfirmedResult,
    tomorrowResult,
    overflowResult,
    statsResult,
    upcomingGuestsResult,
  ] = await Promise.all([
    supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .gte('starts_at', todayStart.toISOString())
      .lte('starts_at', todayEnd.toISOString()),
    supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .gte('starts_at', yesterdayStart.toISOString())
      .lte('starts_at', yesterdayEnd.toISOString()),
    supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .gte('starts_at', todayStart.toISOString())
      .lte('starts_at', todayEnd.toISOString()),
    supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .gte('starts_at', tomorrowStart.toISOString())
      .lte('starts_at', tomorrowEnd.toISOString()),
    supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_manual_review'),
    supabase.rpc('get_reservation_stats', { p_from: from7, p_to: to7 }),
    supabase
      .from('reservations')
      .select('party_size')
      .in('status', ['confirmed', 'pending_manual_review'])
      .gte('starts_at', todayStart.toISOString())
      .lte('starts_at', addDays(todayStart, 14).toISOString()),
  ])

  const todayCount      = todayResult.count     ?? 0
  const yesterdayCount  = yesterdayResult.count ?? 0
  const confirmedToday  = todayConfirmedResult.count ?? 0
  const tomorrowCount   = tomorrowResult.count  ?? 0
  const overflowCount   = overflowResult.count  ?? 0

  const upcomingGuests = (upcomingGuestsResult.data ?? []).reduce(
    (s, r) => s + (r.party_size ?? 0),
    0,
  )

  const rows7 = statsResult.data ?? []
  const total7    = rows7.reduce((s: number, r: { total: number }) => s + r.total, 0)
  const completed7 = rows7.reduce((s: number, r: { completed: number }) => s + r.completed, 0)
  const overflow7  = rows7.reduce((s: number, r: { overflow: number }) => s + r.overflow, 0)
  const completionRate7 = total7 > 0
    ? Math.round((completed7 / Math.max(1, total7 - overflow7)) * 100)
    : null

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard
        tone="brand"
        label={t.overview.todays_reservations}
        value={todayCount}
        hint={t.overview.todays_reservations_sub}
        comparison={{ previous: yesterdayCount, label: t.overview.vs_yesterday }}
        icon={<CalendarDays className="h-4 w-4" strokeWidth={2} />}
      />
      <StatCard
        tone="success"
        label={t.overview.confirmed_today}
        value={confirmedToday}
        hint={
          todayCount > 0
            ? `${Math.round((confirmedToday / Math.max(1, todayCount)) * 100)}% ${t.overview.of_todays}`
            : t.overview.confirmed_today_sub
        }
        icon={<CalendarDays className="h-4 w-4" strokeWidth={2} />}
      />
      <StatCard
        label={t.overview.tomorrow_outlook}
        value={tomorrowCount}
        hint={t.overview.tomorrow_outlook_sub}
        icon={<CalendarDays className="h-4 w-4" strokeWidth={2} />}
      />
      <StatCard
        label={t.overview.upcoming_guests}
        value={upcomingGuests}
        hint={t.overview.upcoming_guests_sub}
        icon={<Users className="h-4 w-4" strokeWidth={2} />}
      />
      <StatCard
        tone={overflowCount > 0 ? 'warning' : 'default'}
        label={t.overview.manual_review}
        value={overflowCount}
        hint={overflowCount > 0 ? t.overview.needs_attention : t.overview.queue_clear}
        icon={<AlertTriangle className="h-4 w-4" strokeWidth={2} />}
      />
      <StatCard
        tone={completionRate7 != null && completionRate7 >= 70 ? 'success' : 'default'}
        label={t.overview.completion_rate}
        value={completionRate7 != null ? `${completionRate7}%` : '—'}
        hint={t.overview.completion_rate_sub}
        icon={<TrendingUp className="h-4 w-4" strokeWidth={2} />}
      />
    </div>
  )
}
