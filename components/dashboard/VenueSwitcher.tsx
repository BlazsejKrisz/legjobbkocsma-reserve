'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type VenueOption = { id: string; name: string }

type Props = {
  currentId: string
  venues: VenueOption[]
}

// Refined venue picker — shadcn Select instead of bare <select>.
// Matches the rest of the dashboard (Radix-driven popover, focus trap,
// keyboard nav, theming via the tokens) and looks consistent across
// platforms instead of the native chrome differing on Mac/Windows/Linux.
export function VenueSwitcher({ currentId, venues }: Props) {
  const router = useRouter()

  if (venues.length <= 1) return null

  return (
    <Select
      value={currentId}
      onValueChange={(id) => router.push(`/dashboard/venues/${id}`)}
    >
      <SelectTrigger className="h-8 w-auto min-w-[180px] gap-1.5 text-sm font-medium">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {venues.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            {v.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
