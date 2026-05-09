import { createClient } from '@/lib/supabase/server'
import { getServerT } from '@/lib/i18n/serverT'
import { addDays, format } from 'date-fns'
import { hu, enUS } from 'date-fns/locale'
import { cookies } from 'next/headers'
import { cn } from '@/lib/utils'
import { Flame } from 'lucide-react'

// "Outlook" panel: next 7 days at-a-glance.  For each day we count
// active (non-cancelled) bookings and sum guest counts; the peak day
// gets a flame badge so staff immediately see "Saturday is the spike".
//
// All data is from real reservations already in the system — no
// forecasting, no projection.  Just what's currently on the books.

export async function UpcomingWeekStrip() {
  const [supabase, t, store] = await Promise.all([
    createClient(),
    getServerT(),
    cookies(),
  ])
  const lang = store.get('lang')?.value === 'hu' ? 'hu' : 'en'
  const locale = lang === 'hu' ? hu : enUS

  const tomorrowStart = addDays(new Date(), 1)
  tomorrowStart.setHours(0, 0, 0, 0)
  const horizonEnd = addDays(tomorrowStart, 7)

  const { data } = await supabase
    .from('reservations')
    .select('starts_at, party_size, status')
    .neq('status', 'cancelled')
    .gte('starts_at', tomorrowStart.toISOString())
    .lt('starts_at', horizonEnd.toISOString())

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(tomorrowStart, i)
    return {
      date: d,
      key: format(d, 'yyyy-MM-dd'),
      count: 0,
      guests: 0,
    }
  })

  for (const r of data ?? []) {
    const day = format(new Date(r.starts_at), 'yyyy-MM-dd')
    const target = days.find((d) => d.key === day)
    if (target) {
      target.count += 1
      target.guests += r.party_size ?? 0
    }
  }

  const peakCount = Math.max(...days.map((d) => d.count), 0)
  const peakGuests = Math.max(...days.map((d) => d.guests), 1)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-5 h-full">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t.overview.upcoming_week_title}
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t.overview.upcoming_week_subtitle}
          </p>
        </div>
      </div>

      <ol className="flex flex-col gap-1.5 mt-1">
        {days.map((d) => {
          const isPeak = peakCount > 0 && d.count === peakCount
          const ratio = d.guests / peakGuests
          const widthPct = ratio > 0 ? Math.max(8, Math.round(ratio * 100)) : 0

          return (
            <li
              key={d.key}
              className="grid grid-cols-[80px_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors"
            >
              <div className="flex flex-col">
                <span className={cn(
                  'text-[13px] font-medium leading-tight',
                  isPeak ? 'text-foreground' : 'text-foreground/90',
                )}>
                  {format(d.date, 'EEE', { locale }).replace(/^./, (c) => c.toUpperCase())}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {format(d.date, 'MMM d', { locale })}
                </span>
              </div>

              <div className="relative h-2 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-full transition-all',
                    isPeak ? 'bg-primary' : 'bg-primary/40',
                  )}
                  style={{ width: `${widthPct}%` }}
                />
              </div>

              <div className="flex items-center gap-2 tabular-nums">
                {isPeak && d.count > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-primary">
                    <Flame className="h-3 w-3" strokeWidth={2.5} />
                    {t.overview.peak}
                  </span>
                )}
                <span className="text-[13px] font-semibold tabular-nums text-foreground min-w-[2ch] text-right">
                  {d.count}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums min-w-[3ch] text-right">
                  · {d.guests}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
