'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Settings, ChevronRight, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CreateVenueDialog } from './VenueForm'
import { useVenues } from '@/lib/hooks/venues/useVenues'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/useT'

type Props = {
  isSuperAdmin: boolean
}

export function VenueList({ isSuperAdmin }: Props) {
  const t = useT()
  const [createOpen, setCreateOpen] = useState(false)
  const { data, isLoading } = useVenues()
  const venues = data?.data ?? []

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{t.venues.title}</h2>
        {isSuperAdmin && (
          <Button size="sm" className="h-8" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t.venues.new_venue}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="h-9">
              <TableHead className="text-xs">{t.venues.name}</TableHead>
              <TableHead className="text-xs">{t.venues.slug}</TableHead>
              <TableHead className="text-xs">{t.venues.status}</TableHead>
              <TableHead className="text-xs text-right">{t.venues.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="h-10">
                  <TableCell colSpan={4}>
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && venues.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  {t.venues.no_venues}
                </TableCell>
              </TableRow>
            )}

            {venues.map((v) => (
              <TableRow key={v.id} className="h-10">
                <TableCell className="text-sm font-medium">{v.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">{v.slug}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Circle
                      className={cn(
                        'h-2 w-2 fill-current',
                        v.is_active ? 'text-success' : 'text-zinc-500',
                      )}
                    />
                    <span className="text-xs text-muted-foreground">
                      {v.is_active ? t.venues.active : t.venues.inactive}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                      <Link href={`/dashboard/venues/${v.id}`}>
                        <ChevronRight className="h-3.5 w-3.5 mr-1" />
                        {t.venues.view}
                      </Link>
                    </Button>
                    {isSuperAdmin && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                        <Link href={`/dashboard/venues/${v.id}/settings`}>
                          <Settings className="h-3.5 w-3.5 mr-1" />
                          {t.venues.settings}
                        </Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateVenueDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
