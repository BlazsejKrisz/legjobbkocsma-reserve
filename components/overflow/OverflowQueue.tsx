'use client'

import { useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { useT } from '@/lib/i18n/useT'
import type { Reservation } from '@/lib/types/reservation'

type Props = {
  venueId?: string
}

export function OverflowQueue({ venueId }: Props) {
  const t = useT()
  const [reassignTarget, setReassignTarget] = useState<Reservation | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const { data, isLoading, refetch, isFetching } = useOverflowQueue(venueId)
  const cancel = useUpdateReservation()

  const items: Reservation[] = data?.data ?? []
  const confirmCancellation = (reservationId: string) => {
    cancel.mutate(
      { id: reservationId, status: 'cancelled' },
      { onSuccess: () => setCancelTarget(null) },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.overflow.cancel_title}</DialogTitle>
            <DialogDescription>
              {t.overflow.cancel_description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>
              Back
            </Button>
            <Button
              variant="destructive"
              disabled={cancel.isPending}
              onClick={() => cancelTarget && confirmCancellation(cancelTarget.id)}
            >
              {cancel.isPending ? t.detail.cancelling : t.detail.confirm_cancellation}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium">{t.overflow.pending_items}</span>
          {items.length > 0 && (
            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
              {items.length}
            </Badge>
          )}
          {!isLoading && items.length === 0 && (
            <span className="text-[11px] text-muted-foreground">{t.overflow.queue_clear}</span>
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
          {t.overflow.refresh}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="h-9">
              <TableHead className="text-xs">{t.overflow.date_time}</TableHead>
              <TableHead className="text-xs">{t.overflow.customer}</TableHead>
              <TableHead className="text-xs">{t.overflow.guests}</TableHead>
              <TableHead className="text-xs">{t.overflow.venue}</TableHead>
              <TableHead className="text-xs">{t.overflow.source}</TableHead>
              <TableHead
                className="text-xs"
                title={t.overflow.overflow_reason_tooltip}
              >
                {t.overflow.overflow_reason} ↗
              </TableHead>
              <TableHead className="text-xs">{t.overflow.actions}</TableHead>
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
                  {t.overflow.no_pending}
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
                  {t.source[r.source] ?? r.source}
                </TableCell>
                <TableCell className="text-xs max-w-36">
                  {r.overflow_reason ? (
                    <span className="text-amber-400 text-[11px]">
                      {t.overflow_reason[r.overflow_reason] ?? r.overflow_reason}
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
                      {t.overflow.reassign}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-red-400 hover:text-red-300"
                      disabled={cancel.isPending}
                      onClick={() => setCancelTarget(r)}
                    >
                      {t.overflow.cancel}
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
