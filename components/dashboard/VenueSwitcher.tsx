'use client'

import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

type VenueOption = { id: string; name: string }

type Props = {
  currentId: string
  venues: VenueOption[]
}

export function VenueSwitcher({ currentId, venues }: Props) {
  const router = useRouter()

  if (venues.length <= 1) return null

  return (
    <div className="relative inline-flex items-center">
      <select
        value={currentId}
        onChange={(e) => router.push(`/dashboard/venues/${e.target.value}`)}
        className="appearance-none rounded-lg border border-border bg-background pl-3 pr-7 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
      >
        {venues.map((v) => (
          <option key={v.id} value={v.id}>{v.name}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground" />
    </div>
  )
}
