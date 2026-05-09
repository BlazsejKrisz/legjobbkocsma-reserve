import { createClient } from '@/lib/supabase/server'
import { getServerT } from '@/lib/i18n/serverT'
import { cn } from '@/lib/utils'
import { Clock, Users } from 'lucide-react'

// Visual: an hour-by-hour density strip for *today*.  Each cell is
// one hour from 06:00 to 02:00 (a typical hospitality service day),
// height-scaled to the busiest hour.  Empty hours show as a tiny
// baseline so the grid still reads as "covered, just quiet".
//
// Why this, not the full Timeline component?
//   * The full Timeline is per-venue + needs scrolling + table grid.
//   * Here we just want a glance: "is the evening packed or quiet?"
//   * Aggregates across all venues the user has access to.
//
// Renders nothing if there are zero bookings today — keeps the
// dashboard clean when a fresh deploy has no data.

const FROM_HOUR = 6   // venues open earliest at 06:00 (rare but possible)
const TO_HOUR   = 26  // 26 = 02:00 the next morning

export async function TodayHourStrip() {
  const [supabase, t] = await Promise.all([createClient(), getServerT()])

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('reservations')
    .select('starts_at, party_size, status')
    .gte('starts_at', todayStart.toISOString())
    .lte('starts_at', todayEnd.toISOString())
    .neq('status', 'cancelled')
    .order('starts_at')

  if (error || !data || data.length === 0) {
    // Empty state for the whole strip — restrained, clear copy.
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t.overview.today_hours_title}
          </h3>
        </div>
        <div className="flex items-center gap-3 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/60 ring-1 ring-inset ring-border/60">
            <Clock className="h-4 w-4 text-muted-foreground/70" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {t.overview.today_hours_empty_title}
            </p>
            <p className="text-[13px] text-muted-foreground">
              {t.overview.today_hours_empty_hint}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Bucket bookings by hour (0–25 representing 0:00 to 25:00 = 1AM next day).
  // We bucket by the booking's start hour; an 18:30 → 20:30 booking lights
  // up the 18 cell only.  This is a "starts at" density, which is what
  // staff scan for in real life ("when's the next dinner rush?").
  const hourBuckets = new Array(28).fill(0).map(() => ({
    count: 0,
    guests: 0,
  }))
  let firstHour = 24
  let lastHour = 0
  let totalCount = 0
  let totalGuests = 0

  for (const r of data) {
    const start = new Date(r.starts_at)
    let h = start.getHours()
    // Bookings starting between 0:00–6:00 (after-midnight) bucket to
    // h+24 so they appear at the end of the strip (e.g. 1:00 → 25:00).
    if (h < FROM_HOUR) h += 24
    const bucket = hourBuckets[h]
    if (bucket) {
      bucket.count += 1
      bucket.guests += r.party_size ?? 0
      totalCount += 1
      totalGuests += r.party_size ?? 0
      if (h < firstHour) firstHour = h
      if (h > lastHour) lastHour = h
    }
  }

  const peakCount = Math.max(...hourBuckets.map((b) => b.count), 1)
  const cells = Array.from({ length: TO_HOUR - FROM_HOUR + 1 }, (_, i) => {
    const h = FROM_HOUR + i
    const bucket = hourBuckets[h] ?? { count: 0, guests: 0 }
    return {
      hour: h % 24,
      count: bucket.count,
      guests: bucket.guests,
      ratio: bucket.count / peakCount,
    }
  })

  // First and last booking time labels for context
  const fmtHour = (h: number) =>
    `${String(h % 24).padStart(2, '0')}:00`

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t.overview.today_hours_title}
          </h3>
          <p className="mt-1 text-sm text-foreground">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {totalCount}
            </span>
            <span className="ml-1.5 text-muted-foreground">
              {totalCount === 1 ? t.overview.reservation_one : t.overview.reservation_other}
              {' · '}
              <Users className="inline h-3 w-3 -mt-0.5" />
              {' '}
              <span className="tabular-nums">{totalGuests}</span>{' '}
              {t.overview.guests_label}
            </span>
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {fmtHour(firstHour)} → {fmtHour(lastHour + 1)}
        </p>
      </div>

      {/* The strip itself — a row of bars, one per hour from 06:00 to 02:00.
          Every 4th bar gets a label below for context.  Active hours
          take the brand color, empty hours a baseline tint. */}
      <div className="flex items-end gap-px h-14 bg-muted/30 rounded-md p-1.5">
        {cells.map((c) => {
          const isActive = c.count > 0
          // Min visual height even for empty hours so the strip looks
          // structured rather than collapsed.  Active hours scale to a
          // max ~85% of the container.
          const heightPct = isActive ? 12 + Math.round(c.ratio * 73) : 8
          return (
            <div
              key={c.hour + (c.hour < FROM_HOUR ? 24 : 0)}
              className="flex-1 flex items-end justify-center group relative"
              title={`${String(c.hour).padStart(2, '0')}:00 · ${c.count} ${c.count === 1 ? t.overview.reservation_one : t.overview.reservation_other} · ${c.guests} ${t.overview.guests_label}`}
            >
              <div
                className={cn(
                  'w-full rounded-sm transition-colors',
                  isActive
                    ? 'bg-primary/80 group-hover:bg-primary'
                    : 'bg-muted-foreground/10 group-hover:bg-muted-foreground/20',
                )}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          )
        })}
      </div>

      {/* Hour-axis labels (every 3 hours) */}
      <div className="grid grid-cols-7 gap-1 px-1.5 -mt-1 tabular-nums">
        {[6, 9, 12, 15, 18, 21, 0].map((h) => (
          <span key={h} className="text-[10px] text-muted-foreground/70">
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </div>
  )
}
