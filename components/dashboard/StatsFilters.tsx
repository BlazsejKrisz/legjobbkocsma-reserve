'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
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

type Venue = { id: string; name: string }

type Props = {
  venues: Venue[]
}

const TODAY = format(new Date(), 'yyyy-MM-dd')

const PRESETS = [
  {
    id: '7d',
    label: 'Last 7 days',
    get: () => ({ from: format(subDays(new Date(), 6), 'yyyy-MM-dd'), to: TODAY }),
  },
  {
    id: '30d',
    label: 'Last 30 days',
    get: () => ({ from: format(subDays(new Date(), 29), 'yyyy-MM-dd'), to: TODAY }),
  },
  {
    id: '90d',
    label: 'Last 90 days',
    get: () => ({ from: format(subDays(new Date(), 89), 'yyyy-MM-dd'), to: TODAY }),
  },
] as const

export function StatsFilters({ venues }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()
  const [customOpen, setCustomOpen] = useState(params.get('range') === 'custom')

  const currentRange = params.get('range') ?? '30d'
  const currentVenue = params.get('venue_id') ?? ''
  const customFrom = params.get('from') ?? ''
  const customTo = params.get('to') ?? ''

  function push(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    startTransition(() => router.push(`${pathname}?${next.toString()}`))
  }

  function applyPreset(id: string) {
    setCustomOpen(false)
    push({ range: id, from: '', to: '' })
  }

  function applyCustom(from: string, to: string) {
    push({ range: 'custom', from, to })
  }

  const isCustomActive = currentRange === 'custom'

  return (
    <div className="flex flex-col gap-3">
      {/* Presets + venue */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          Range:
        </span>

        {PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={currentRange === p.id ? 'default' : 'outline'}
            className="h-7 text-[11px] px-3"
            onClick={() => applyPreset(p.id)}
          >
            {p.label}
          </Button>
        ))}

        <Button
          size="sm"
          variant={isCustomActive || customOpen ? 'default' : 'outline'}
          className="h-7 text-[11px] px-3"
          onClick={() => setCustomOpen((o) => !o)}
        >
          Custom
        </Button>

        {venues.length > 1 && (
          <Select
            value={currentVenue}
            onValueChange={(v) => push({ venue_id: v === '__all' ? '' : v })}
          >
            <SelectTrigger className="h-7 w-40 text-[11px]">
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
      </div>

      {/* Custom date pickers */}
      {(customOpen || isCustomActive) && (
        <div className="flex flex-wrap items-center gap-2 pl-1">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-muted-foreground">From</label>
            <Input
              type="date"
              defaultValue={customFrom}
              max={customTo || TODAY}
              className="h-7 w-36 text-xs"
              onChange={(e) => applyCustom(e.target.value, customTo)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-muted-foreground">To</label>
            <Input
              type="date"
              defaultValue={customTo}
              min={customFrom || undefined}
              max={TODAY}
              className="h-7 w-36 text-xs"
              onChange={(e) => applyCustom(customFrom, e.target.value)}
            />
          </div>
          {customFrom && customTo && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] px-2 text-muted-foreground"
              onClick={() => { push({ range: '30d', from: '', to: '' }); setCustomOpen(false) }}
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
