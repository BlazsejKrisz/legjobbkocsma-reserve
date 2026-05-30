'use client'

import { useCallback, useRef, useState } from 'react'
import { format, subDays } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CalendarDays, X } from 'lucide-react'
import { useT } from '@/lib/i18n/useT'
import type { Venue } from '@/lib/types/venue'

export type ReservationFilterState = {
  venueId: string
  status: string
  source: string
  dateFrom: string
  dateTo: string
  search: string
  sortBy: 'created_at' | 'starts_at'
  // Hide cancelled reservations by default — busy nights produce a lot of
  // cancellations and they were drowning the active list.  Staff opts in
  // explicitly when they need to see them.
  showCancelled: boolean
}

type Props = {
  filters: ReservationFilterState
  venues: Venue[]
  onChange: (filters: ReservationFilterState) => void
  onReset: () => void
}

const STATUSES = [
  'confirmed',
  'pending_manual_review',
  'cancelled',
  'completed',
  'no_show',
] as const

const SOURCES = [
  'web',
  'phone',
  'admin',
  'walk_in',
  'partner',
] as const

// Quick date presets — each returns { dateFrom, dateTo } as YYYY-MM-DD strings
const TODAY = format(new Date(), 'yyyy-MM-dd')
const PRESETS = [
  {
    id: 'today',
    get: () => ({ dateFrom: TODAY, dateTo: TODAY }),
  },
  {
    id: 'yesterday',
    get: () => {
      const d = format(subDays(new Date(), 1), 'yyyy-MM-dd')
      return { dateFrom: d, dateTo: d }
    },
  },
  {
    id: '7d',
    get: () => ({
      dateFrom: format(subDays(new Date(), 6), 'yyyy-MM-dd'),
      dateTo: TODAY,
    }),
  },
  {
    id: '30d',
    get: () => ({
      dateFrom: format(subDays(new Date(), 29), 'yyyy-MM-dd'),
      dateTo: TODAY,
    }),
  },
] as const

/** Detect which preset is currently active (exact match) */
function activePresetId(dateFrom: string, dateTo: string): string | null {
  for (const p of PRESETS) {
    const range = p.get()
    if (range.dateFrom === dateFrom && range.dateTo === dateTo) return p.id
  }
  return null
}

export const DEFAULT_FILTERS: ReservationFilterState = {
  venueId: '',
  status: '',
  source: '',
  dateFrom: '',
  dateTo: '',
  search: '',
  sortBy: 'created_at',
  showCancelled: false,
}

export function ReservationFilters({ filters, venues, onChange, onReset }: Props) {
  const t = useT()
  const [customOpen, setCustomOpen] = useState(false)

  const set = (patch: Partial<ReservationFilterState>) =>
    onChange({ ...filters, ...patch })

  // `showCancelled` and `sortBy` are view-mode toggles, not narrowing filters
  // — treating them as "active" makes the Reset-all button flicker in/out
  // every time the user just changes the view, shifting the row layout.
  // Only the real filter fields count here.
  const hasActive = Boolean(
    filters.venueId || filters.status || filters.source ||
    filters.dateFrom || filters.dateTo || filters.search,
  )
  const activePreset = activePresetId(filters.dateFrom, filters.dateTo)
  const hasDateFilter = filters.dateFrom || filters.dateTo

  // Debounce search so we don't fire on every keystroke
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearch = useCallback(
    (value: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
      searchTimer.current = setTimeout(() => set({ search: value }), 300)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters],
  )

  const applyPreset = (id: typeof PRESETS[number]['id']) => {
    const preset = PRESETS.find((p) => p.id === id)!
    set(preset.get())
    setCustomOpen(false)
  }

  const clearDates = () => {
    set({ dateFrom: '', dateTo: '' })
    setCustomOpen(false)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Sort-mode switch — segmented control, centered, content-width.
          Bigger than the rest of the filter chrome on purpose: this is the
          single most-touched toggle on the page and was previously easy to
          miss tucked into the corner. */}
      <div className="flex justify-center pb-1">
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
          {(['created_at', 'starts_at'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => set({ sortBy: mode, dateFrom: '', dateTo: '' })}
              className={[
                'px-6 py-2 text-sm font-medium rounded-md transition-colors',
                filters.sortBy === mode
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {mode === 'created_at' ? t.reservations_list.by_received : t.reservations_list.by_reservation}
            </button>
          ))}
        </div>
      </div>

      {/* Row 1: search + dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          defaultValue={filters.search}
          onChange={(e) => handleSearch(e.target.value)}
          className="h-8 w-48 text-xs"
          placeholder={t.filters.search_placeholder}
        />

        {venues.length > 1 && (
          <Select
            value={filters.venueId}
            onValueChange={(v) => set({ venueId: v === '__all' ? '' : v })}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder={t.filters.all_venues} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t.filters.all_venues}</SelectItem>
              {venues.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filters.status}
          onValueChange={(v) => set({ status: v === '__all' ? '' : v })}
        >
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder={t.filters.all_statuses} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{t.filters.all_statuses}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t.status[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.source}
          onValueChange={(v) => set({ source: v === '__all' ? '' : v })}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder={t.filters.all_sources} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{t.filters.all_sources}</SelectItem>
            {SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {t.source[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActive && (
          <Button variant="ghost" size="sm" onClick={onReset} className="h-8 text-xs gap-1">
            <X className="h-3 w-3" />
            {t.filters.reset_all}
          </Button>
        )}
      </div>

      {/* Row 2: date range presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground mr-1">
          <CalendarDays className="h-3 w-3" />
          {filters.sortBy === 'created_at' ? t.filters.received_date : t.filters.reservation_date}:
        </span>

        {PRESETS.map((p) => {
          const presetLabel: Record<typeof p.id, string> = {
            today: t.filters.today,
            yesterday: t.filters.yesterday,
            '7d': t.filters.last_7_days,
            '30d': t.filters.last_30_days,
          }
          return (
            <Button
              key={p.id}
              variant={activePreset === p.id ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-[11px] px-2.5"
              onClick={() => applyPreset(p.id)}
            >
              {presetLabel[p.id]}
            </Button>
          )
        })}

        <Button
          variant={customOpen || (hasDateFilter && !activePreset) ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-[11px] px-2.5"
          onClick={() => setCustomOpen((o) => !o)}
        >
          {t.filters.custom_range}
        </Button>

        {hasDateFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] px-2 text-muted-foreground"
            onClick={clearDates}
          >
            <X className="h-3 w-3 mr-1" />
            {t.filters.clear_dates}
          </Button>
        )}
      </div>

      {/* Custom date pickers — shown when "Custom range" is open or a custom range is set */}
      {(customOpen || (hasDateFilter && !activePreset)) && (
        <div className="flex flex-wrap items-center gap-2 pl-1">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-muted-foreground">{t.filters.from}</label>
            <Input
              type="date"
              value={filters.dateFrom}
              max={filters.dateTo || undefined}
              onChange={(e) => set({ dateFrom: e.target.value })}
              className="h-7 w-36 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-muted-foreground">{t.filters.to}</label>
            <Input
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(e) => set({ dateTo: e.target.value })}
              className="h-7 w-36 text-xs"
            />
          </div>
          {filters.dateFrom && filters.dateTo && (
            <span className="text-[11px] text-muted-foreground">
              {filters.dateFrom === filters.dateTo
                ? filters.dateFrom
                : `${filters.dateFrom} → ${filters.dateTo}`}
            </span>
          )}
        </div>
      )}

      {/* Show-cancelled toggle.  Centered on its own row so it doesn't share
          space with "Reset all" (which appears/disappears and was shifting
          the click target out from under the cursor).  Label is properly
          associated via htmlFor so clicking the text toggles the box too. */}
      {!filters.status && (
        <div className="flex justify-center pt-1">
          <div className="flex items-center gap-2">
            <Checkbox
              id="lk-show-cancelled"
              checked={filters.showCancelled}
              onCheckedChange={(v) => set({ showCancelled: v === true })}
            />
            <Label
              htmlFor="lk-show-cancelled"
              className="text-xs text-muted-foreground cursor-pointer select-none"
            >
              {t.filters.show_cancelled}
            </Label>
          </div>
        </div>
      )}
    </div>
  )
}
