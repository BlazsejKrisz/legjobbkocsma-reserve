'use client'

import { useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ReassignmentDialog } from './ReassignmentDialog'
import { useOverflowQueue } from '@/lib/hooks/overflow/useOverflow'
import { useUpdateReservation } from '@/lib/hooks/reservations/useUpdateReservation'
import { formatTimeRange, formatDateYYYYMMDD } from '@/lib/datetime'
import { OVERFLOW_REASON_LABELS, SOURCE_LABELS } from '@/lib/domain/reservation'
import type { Reservation } from '@/lib/types/reservation'

type Props = {
  venueId?: string
}

export function OverflowQueue({ venueId }: Props) {
  const [reassignTarget, setReassignTarget] = useState<Reservation | null>(null)
  const { data, isLoading, refetch, isFetching } = useOverflowQueue(venueId)
  const cancel = useUpdateReservation()

  const items: Reservation[] = data?.data ?? []

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium">Pending items</span>
          {items.length > 0 && (
            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
              {items.length}
            </Badge>
          )}
          {!isLoading && items.length === 0 && (
            <span className="text-[11px] text-muted-foreground">Queue is clear</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="h-9">
              <TableHead className="text-xs">Date & time</TableHead>
              <TableHead className="text-xs">Customer</TableHead>
              <TableHead className="text-xs">Guests</TableHead>
              <TableHead className="text-xs">Venue</TableHead>
              <TableHead className="text-xs">Source</TableHead>
              <TableHead
                className="text-xs"
                title="Why the system couldn't auto-assign this reservation. Common reasons: no tables available, party too large, outside open hours."
              >
                Overflow reason ↗
              </TableHead>
              <TableHead className="text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="h-10">
                  <TableCell colSpan={7}>
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No reservations pending manual review. 🎉
                </TableCell>
              </TableRow>
            )}

            {items.map((r) => (
              <TableRow key={r.id} className="h-10">
                <TableCell className="text-xs tabular-nums">
                  <span className="font-medium">{formatDateYYYYMMDD(r.starts_at)}</span>
                  <br />
                  <span className="text-muted-foreground">
                    {formatTimeRange(r.starts_at, r.ends_at)}
                  </span>
                </TableCell>
                <TableCell className="text-xs">
                  <span className="font-medium">{r.customers?.full_name ?? 'Walk-in'}</span>
                  {r.customers?.email && (
                    <>
                      <br />
                      <span className="text-muted-foreground">{r.customers.email}</span>
                    </>
                  )}
                  {r.customers?.phone && (
                    <>
                      <br />
                      <span className="text-muted-foreground">{r.customers.phone}</span>
                    </>
                  )}
                </TableCell>
                <TableCell className="text-xs text-center">{r.party_size}</TableCell>
                <TableCell className="text-xs">{r.requested_venue?.name ?? '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {SOURCE_LABELS[r.source] ?? r.source}
                </TableCell>
                <TableCell className="text-xs max-w-36">
                  {r.overflow_reason ? (
                    <span className="text-amber-400 text-[11px]">
                      {OVERFLOW_REASON_LABELS[r.overflow_reason] ?? r.overflow_reason}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setReassignTarget(r)}
                    >
                      Reassign
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-red-400 hover:text-red-300"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate({ id: r.id, status: 'cancelled' })}
                    >
                      Cancel
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ReassignmentDialog
        reservation={reassignTarget}
        onClose={() => setReassignTarget(null)}
      />
    </div>
  )
}
