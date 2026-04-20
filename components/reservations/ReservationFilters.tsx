'use client'

import { useCallback, useRef, useState } from 'react'
import { format, subDays } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CalendarDays, X } from 'lucide-react'
import type { Venue } from '@/lib/types/venue'

export type ReservationFilterState = {
  venueId: string
  status: string
  source: string
  dateFrom: string
  dateTo: string
  search: string
}

type Props = {
  filters: ReservationFilterState
  venues: Venue[]
  onChange: (filters: ReservationFilterState) => void
  onReset: () => void
}

const STATUSES = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending_manual_review', label: 'Manual Review' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' },
  { value: 'no_show', label: 'No Show' },
]

const SOURCES = [
  { value: 'web', label: 'Web' },
  { value: 'phone', label: 'Phone' },
  { value: 'admin', label: 'Admin' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'partner', label: 'Partner' },
]

// Quick date presets — each returns { dateFrom, dateTo } as YYYY-MM-DD strings
const TODAY = format(new Date(), 'yyyy-MM-dd')
const PRESETS = [
  {
    label: 'Today',
    id: 'today',
    get: () => ({ dateFrom: TODAY, dateTo: TODAY }),
  },
  {
    label: 'Yesterday',
    id: 'yesterday',
    get: () => {
      const d = format(subDays(new Date(), 1), 'yyyy-MM-dd')
      return { dateFrom: d, dateTo: d }
    },
  },
  {
    label: 'Last 7 days',
    id: '7d',
    get: () => ({
      dateFrom: format(subDays(new Date(), 6), 'yyyy-MM-dd'),
      dateTo: TODAY,
    }),
  },
  {
    label: 'Last 30 days',
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
}

export function ReservationFilters({ filters, venues, onChange, onReset }: Props) {
  const [customOpen, setCustomOpen] = useState(false)

  const set = (patch: Partial<ReservationFilterState>) =>
    onChange({ ...filters, ...patch })

  const hasActive = Object.values(filters).some(Boolean)
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
      {/* Row 1: search + dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          defaultValue={filters.search}
          onChange={(e) => handleSearch(e.target.value)}
          className="h-8 w-48 text-xs"
          placeholder="Search customer…"
        />

        {venues.length > 1 && (
          <Select
            value={filters.venueId}
            onValueChange={(v) => set({ venueId: v === '__all' ? '' : v })}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="All venues" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All venues</SelectItem>
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
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.source}
          onValueChange={(v) => set({ source: v === '__all' ? '' : v })}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All sources</SelectItem>
            {SOURCES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActive && (
          <Button variant="ghost" size="sm" onClick={onReset} className="h-8 text-xs gap-1">
            <X className="h-3 w-3" />
            Reset all
          </Button>
        )}
      </div>

      {/* Row 2: date range presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground mr-1">
          <CalendarDays className="h-3 w-3" />
          Date range:
        </span>

        {PRESETS.map((p) => (
          <Button
            key={p.id}
            variant={activePreset === p.id ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-[11px] px-2.5"
            onClick={() => applyPreset(p.id)}
          >
            {p.label}
          </Button>
        ))}

        <Button
          variant={customOpen || (hasDateFilter && !activePreset) ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-[11px] px-2.5"
          onClick={() => setCustomOpen((o) => !o)}
        >
          Custom range
        </Button>

        {hasDateFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] px-2 text-muted-foreground"
            onClick={clearDates}
          >
            <X className="h-3 w-3 mr-1" />
            Clear dates
          </Button>
        )}
      </div>

      {/* Custom date pickers — shown when "Custom range" is open or a custom range is set */}
      {(customOpen || (hasDateFilter && !activePreset)) && (
        <div className="flex flex-wrap items-center gap-2 pl-1">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-muted-foreground">From</label>
            <Input
              type="date"
              value={filters.dateFrom}
              max={filters.dateTo || undefined}
              onChange={(e) => set({ dateFrom: e.target.value })}
              className="h-7 w-36 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-muted-foreground">To</label>
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
    </div>
  )
}
