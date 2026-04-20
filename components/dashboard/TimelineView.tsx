'use client'

import { useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, MoonStar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTables } from '@/lib/hooks/venues/useTables'
import { useVenueOpenHours } from '@/lib/hooks/venues/useVenues'
import { useTimelineReservations } from '@/lib/hooks/reservations/useReservations'
import { ReservationDetail } from '@/components/reservations/ReservationDetail'
import { CreateReservationDialog } from '@/components/reservations/CreateReservationDialog'
import {
  todayYYYYMMDD,
  formatTimeHHMM,
  buildDashboardWindow,
  getTimelinePlacement,
  buildHourTicks,
} from '@/lib/datetime'
import { STATUS_LABELS } from '@/lib/domain/reservation'
import type { TableType } from '@/lib/types/table'
import type { Reservation } from '@/lib/types/reservation'
import type { Venue, VenueOpenHours, Weekday } from '@/lib/types/venue'

// ─── Layout constants ─────────────────────────────────────────────────────────
const HOUR_WIDTH    = 80   // px per hour
const ROW_HEIGHT    = 48   // px per table row
const HEADER_HEIGHT = 32   // px for the time-label row
const LABEL_WIDTH   = 128  // px for the fixed left column

// ─── Fallback window when open hours aren't loaded yet ───────────────────────
const FALLBACK_FROM = '10:00'
const FALLBACK_TO   = '02:00'

// JS getDay() → Weekday name (0 = Sunday)
const JS_DAY_TO_WEEKDAY: Weekday[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
]

function getWeekdayForDate(dateYYYYMMDD: string): Weekday {
  return JS_DAY_TO_WEEKDAY[new Date(dateYYYYMMDD + 'T12:00:00').getDay()]
}

function getWindowForDate(
  openHours: VenueOpenHours[],
  dateYYYYMMDD: string,
): { from: string; to: string; isClosed: boolean } {
  const weekday = getWeekdayForDate(dateYYYYMMDD)
  const row = openHours.find((h) => h.weekday === weekday)

  if (!row || !row.is_open || !row.open_time || !row.close_time) {
    return { from: FALLBACK_FROM, to: FALLBACK_TO, isClosed: !!(row && !row.is_open) }
  }
  return { from: row.open_time, to: row.close_time, isClosed: false }
}

// ─── Block colours ────────────────────────────────────────────────────────────
const BLOCK_BG: Record<string, string> = {
  confirmed:             'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
  pending_manual_review: 'bg-amber-500/20  border-amber-500/40  text-amber-300',
  completed:             'bg-blue-500/20   border-blue-500/40   text-blue-300',
  cancelled:             'bg-zinc-500/10   border-zinc-500/25   text-zinc-500',
  no_show:               'bg-red-500/15    border-red-500/30    text-red-400',
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Props = {
  venueId: string
  venues: Venue[]
  tableTypes: TableType[]
}

type CreatePrefill = {
  date?: string
  from_time?: string
  until_time?: string
}

// ─── Component ────────────────────────────────────────────────────────────────
export function TimelineView({ venueId, venues, tableTypes }: Props) {
  const [date, setDate] = useState(todayYYYYMMDD)
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createPrefill, setCreatePrefill] = useState<CreatePrefill | undefined>()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const { data: tablesData, isLoading: tablesLoading } = useTables(venueId)
  const { data: openHoursData } = useVenueOpenHours(venueId)
  const { data: reservationsData, isLoading: resLoading } = useTimelineReservations(venueId, date)

  const tables = (tablesData?.data ?? [])
    .filter((t) => t.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)

  const reservations = reservationsData?.data ?? []

  // Derive the window bounds from the venue's open hours for the selected weekday
  const openHours: VenueOpenHours[] = openHoursData?.data ?? []
  const { from: windowFrom, to: windowTo, isClosed } = getWindowForDate(openHours, date)

  const { windowStart, windowEnd } = buildDashboardWindow({
    date,
    from: windowFrom,
    to: windowTo,
  })
  const windowMs  = windowEnd.getTime() - windowStart.getTime()
  const windowHrs = windowMs / (60 * 60 * 1000)
  // minWidth keeps scroll usable on narrow screens; layout uses % so it fills wider containers
  const minWidth  = windowHrs * HOUR_WIDTH

  const tableResMap = new Map<string, Reservation[]>()
  for (const r of reservations) {
    for (const rt of r.reservation_tables ?? []) {
      if (!rt.released_at) {
        const list = tableResMap.get(rt.table_id) ?? []
        list.push(r)
        tableResMap.set(rt.table_id, list)
      }
    }
  }

  // Hour tick marks — positions and labels derived from the window
  const hourTicks = buildHourTicks(windowStart, windowEnd)

  // ─── Date navigation ─────────────────────────────────────────────────────
  const shiftDate = (delta: number) => {
    const d = new Date(date + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    setDate(d.toISOString().slice(0, 10))
  }

  const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  // ─── Click on empty slot → prefill create dialog ─────────────────────────
  const handleEmptyClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      // Use actual rendered width (not minWidth) so % positions and clicks agree
      const rowWidth = rect.width

      const clickMs = windowStart.getTime() + (clickX / rowWidth) * windowMs
      const snappedMs = Math.round(clickMs / (30 * 60 * 1000)) * (30 * 60 * 1000)
      const from_time  = formatTimeHHMM(new Date(snappedMs).toISOString())
      const until_time = formatTimeHHMM(new Date(snappedMs + 2 * 60 * 60 * 1000).toISOString())

      setCreatePrefill({ date, from_time, until_time })
      setCreateOpen(true)
    },
    [date, windowStart, windowMs],
  )

  return (
    <div className="flex flex-col gap-3">
      {/* ── Date navigation ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => shiftDate(-1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="h-7 rounded-md border border-border bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <span className="text-xs text-muted-foreground hidden sm:inline">{formattedDate}</span>

        {openHours.length > 0 && !isClosed && (
          <span className="text-[10px] text-muted-foreground/60 hidden sm:inline tabular-nums">
            {windowFrom} – {windowTo}
          </span>
        )}

        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => shiftDate(1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setDate(todayYYYYMMDD())}
        >
          Today
        </Button>

        {resLoading && (
          <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>
        )}
      </div>

      {/* ── Closed indicator ────────────────────────────────────────────── */}
      {isClosed && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          <MoonStar className="h-3.5 w-3.5 shrink-0" />
          <span>Venue is closed on this day according to open hours.</span>
        </div>
      )}

      {/* ── Timeline grid ───────────────────────────────────────────────── */}
      <div className="rounded-md border border-border overflow-hidden">
        <div className="flex">
          {/* Fixed left column – table labels */}
          <div className="shrink-0 border-r border-border" style={{ width: LABEL_WIDTH }}>
            <div className="border-b border-border bg-card" style={{ height: HEADER_HEIGHT }} />
            {tablesLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="border-b border-border px-3 flex items-center"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                  </div>
                ))
              : tables.map((table) => (
                  <div
                    key={table.id}
                    className="border-b border-border px-3 flex flex-col justify-center bg-card"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <span className="text-xs font-medium truncate leading-tight">{table.name}</span>
                    {table.area && (
                      <span className="text-[10px] text-muted-foreground truncate leading-tight">
                        {table.area}
                      </span>
                    )}
                  </div>
                ))}
          </div>

          {/* Scrollable timeline area */}
          <div className="overflow-x-auto flex-1">
            {/* width:100% fills the container; minWidth keeps scroll usable on narrow screens */}
            <div style={{ width: '100%', minWidth: minWidth }}>
              {/* Hour labels */}
              <div
                className="relative border-b border-r border-border bg-card overflow-visible"
                style={{ height: HEADER_HEIGHT }}
              >
                {hourTicks.map((tick, i) => {
                  const leftPct =
                    ((tick.getTime() - windowStart.getTime()) / windowMs) * 100
                  const isFirst = i === 0
                  const isLast  = i === hourTicks.length - 1
                  const transform = isFirst
                    ? 'translateX(2px)'
                    : isLast
                    ? 'translateX(calc(-100% - 2px))'
                    : 'translateX(-50%)'
                  return (
                    <span
                      key={tick.getTime()}
                      className="absolute top-0 flex h-full items-center text-[10px] text-muted-foreground tabular-nums select-none"
                      style={{ left: `${leftPct}%`, transform }}
                    >
                      {formatTimeHHMM(tick.toISOString())}
                    </span>
                  )
                })}
              </div>

              {/* Table rows */}
              {tablesLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="border-b border-r border-border bg-background"
                      style={{ height: ROW_HEIGHT }}
                    />
                  ))
                : tables.map((table) => {
                    const tableReservations = tableResMap.get(table.id) ?? []
                    return (
                      <div
                        key={table.id}
                        className="relative border-b border-r border-border cursor-crosshair select-none"
                        style={{ height: ROW_HEIGHT }}
                        onClick={handleEmptyClick}
                      >
                        {/* Hour grid lines */}
                        {hourTicks.map((tick) => {
                          const leftPct =
                            ((tick.getTime() - windowStart.getTime()) / windowMs) * 100
                          return (
                            <div
                              key={tick.getTime()}
                              className="absolute top-0 h-full border-l border-border/60"
                              style={{ left: `${leftPct}%` }}
                            />
                          )
                        })}

                        {/* Half-hour ticks */}
                        {hourTicks.map((tick) => {
                          const halfMs = tick.getTime() + 30 * 60 * 1000
                          if (halfMs >= windowEnd.getTime()) return null
                          const leftPct =
                            ((halfMs - windowStart.getTime()) / windowMs) * 100
                          return (
                            <div
                              key={`h-${tick.getTime()}`}
                              className="absolute top-0 h-full border-l border-border/30"
                              style={{ left: `${leftPct}%` }}
                            />
                          )
                        })}

                        {/* Reservation blocks */}
                        {tableReservations.map((r) => {
                          const placement = getTimelinePlacement({
                            windowStartMs: windowStart.getTime(),
                            windowEndMs:   windowEnd.getTime(),
                            startsAtMs:    new Date(r.starts_at).getTime(),
                            endsAtMs:      new Date(r.ends_at).getTime(),
                          })
                          if (!placement) return null

                          const isHovered = hoveredId === r.id

                          return (
                            <div
                              key={r.id}
                              className={cn(
                                'absolute inset-y-1 rounded border px-1 flex flex-col justify-center cursor-pointer transition-all min-w-[4px]',
                                BLOCK_BG[r.status] ??
                                  'bg-zinc-500/15 border-zinc-500/30 text-zinc-400',
                                isHovered && 'ring-1 ring-white/30 brightness-110',
                              )}
                              style={{
                                left:  `${placement.leftPct}%`,
                                width: `calc(${placement.widthPct}% - 2px)`,
                              }}
                              onMouseEnter={() => setHoveredId(r.id)}
                              onMouseLeave={() => setHoveredId(null)}
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedReservationId(r.id)
                              }}
                              title={[
                                r.customers?.full_name ?? 'Walk-in',
                                `${r.party_size} guests`,
                                STATUS_LABELS[r.status],
                              ].join(' · ')}
                            >
                              {placement.widthPct > 3 && (
                                <span className="text-[10px] font-medium truncate leading-tight">
                                  {r.customers?.full_name ?? 'Walk-in'}
                                </span>
                              )}
                              {placement.widthPct > 6 && (
                                <span className="text-[10px] truncate leading-tight opacity-70">
                                  {r.party_size} guests
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}

              {/* Empty state */}
              {!tablesLoading && tables.length === 0 && (
                <div
                  className="flex items-center justify-center text-xs text-muted-foreground w-full"
                  style={{ height: ROW_HEIGHT * 4 }}
                >
                  No active tables configured for this venue.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {(
          [
            ['confirmed',             'text-emerald-400'],
            ['pending_manual_review', 'text-amber-400'],
            ['completed',             'text-blue-400'],
            ['no_show',               'text-red-400'],
          ] as const
        ).map(([status, cls]) => (
          <span key={status} className={cn('text-[10px] flex items-center gap-1', cls)}>
            <span className={cn('inline-block h-2 w-2 rounded-sm border', BLOCK_BG[status])} />
            {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
          </span>
        ))}
        <span className="text-[10px] text-muted-foreground ml-auto hidden sm:inline">
          Click an empty slot to create a reservation
        </span>
      </div>

      {/* Reservation detail drawer */}
      <ReservationDetail
        reservationId={selectedReservationId}
        onClose={() => setSelectedReservationId(null)}
      />

      {/* Create dialog */}
      <CreateReservationDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        venues={venues}
        tableTypes={tableTypes}
        defaultVenueId={venueId}
        prefill={createPrefill}
      />
    </div>
  )
}
