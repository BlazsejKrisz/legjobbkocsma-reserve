'use client'

import { useState } from 'react'
import { RefreshCw, Sparkles, Check, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
import {
  useOverflowQueue,
  useQuickAcceptOverflow,
} from '@/lib/hooks/overflow/useOverflow'
import { useUpdateReservation } from '@/lib/hooks/reservations/useUpdateReservation'
import { formatTimeRange, formatDateYYYYMMDD } from '@/lib/datetime'
import { useT } from '@/lib/i18n/useT'
import type { Reservation } from '@/lib/types/reservation'

// Pick the right description copy for the confirm dialog based on the
// channel the customer originally chose.  We don't have notification_channel
// on the queue rows themselves (the GET endpoint doesn't select it), so
// fall back to inferring from contact info — same logic the backend uses.
function quickAcceptDescription(
  reservation: Reservation,
  copy: { email: string; sms: string; none: string },
): string {
  const hasEmail = !!reservation.customers?.email
  const hasPhone = !!reservation.customers?.phone
  if (hasEmail) return copy.email
  if (hasPhone) return copy.sms
  return copy.none
}

type Props = {
  venueId?: string
}

export function OverflowQueue({ venueId }: Props) {
  const t = useT()
  const [reassignTarget, setReassignTarget] = useState<Reservation | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [quickAcceptTarget, setQuickAcceptTarget] = useState<Reservation | null>(null)
  const { data, isLoading, refetch, isFetching } = useOverflowQueue(venueId)
  const cancel = useUpdateReservation()
  const quickAccept = useQuickAcceptOverflow()

  const items: Reservation[] = data?.data ?? []
  const confirmCancellation = (reservationId: string) => {
    cancel.mutate(
      { id: reservationId, status: 'cancelled' },
      { onSuccess: () => setCancelTarget(null) },
    )
  }

  const confirmQuickAccept = (reservationId: string) => {
    quickAccept.mutate(
      { reservationId },
      {
        onSuccess: () => {
          toast.success(t.overflow.quick_accept_success)
          setQuickAcceptTarget(null)
        },
        onError: (e) => {
          // Server returns 422 if capacity disappeared between badge
          // render and click; show the friendly message and keep the
          // dialog open so support can choose to bail or open the full
          // reassignment dialog instead.
          const msg = e.message.includes('No longer fits')
            ? t.overflow.quick_accept_no_match
            : e.message
          toast.error(msg)
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.overflow.cancel_title}</DialogTitle>
            <DialogDescription>
              {t.overflow.cancel_description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>
              {t.common.back}
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

      {/* Quick-accept confirm dialog — shown only when the row has a
          waitlist match.  One click + one confirmation flips the
          reservation to confirmed at the original time and sends the
          appropriate notification. */}
      <Dialog
        open={!!quickAcceptTarget}
        onOpenChange={(open) => !open && setQuickAcceptTarget(null)}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.overflow.quick_accept_title}</DialogTitle>
            <DialogDescription>
              {quickAcceptTarget &&
                quickAcceptDescription(quickAcceptTarget, {
                  email: t.overflow.quick_accept_description_email,
                  sms: t.overflow.quick_accept_description_sms,
                  none: t.overflow.quick_accept_description_no_channel,
                })}
            </DialogDescription>
          </DialogHeader>
          {quickAcceptTarget && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs space-y-1">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.overflow.customer}</span>
                <span className="font-medium">
                  {quickAcceptTarget.customers?.full_name ?? '—'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.overflow.date_time}</span>
                <span className="font-medium tabular-nums">
                  {formatDateYYYYMMDD(quickAcceptTarget.starts_at)}
                  {' · '}
                  {formatTimeRange(
                    quickAcceptTarget.starts_at,
                    quickAcceptTarget.ends_at,
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.overflow.guests}</span>
                <span className="font-medium">{quickAcceptTarget.party_size}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setQuickAcceptTarget(null)}>
              {t.common.back}
            </Button>
            <Button
              variant="success"
              disabled={quickAccept.isPending}
              onClick={() =>
                quickAcceptTarget && confirmQuickAccept(quickAcceptTarget.id)
              }
            >
              <Check />
              {quickAccept.isPending
                ? t.overflow.quick_accept_pending
                : t.overflow.quick_accept_confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header — refined: amber dot signals active queue without the
          generic alert-triangle look.  Subdued tone when empty. */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full ring-[3px] transition-colors',
              items.length > 0
                ? 'bg-warning ring-warning/15'
                : 'bg-muted-foreground/40 ring-muted-foreground/10',
            )}
          />
          <span className="text-[13px] font-medium tracking-tight">{t.overflow.pending_items}</span>
          {items.length > 0 && (
            <Badge variant="warning" size="sm">
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
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn('transition-transform', isFetching && 'animate-spin')} />
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
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-12">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 ring-1 ring-inset ring-border/60">
                      <Inbox className="h-4 w-4 text-muted-foreground/70" strokeWidth={1.75} />
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                      {t.overflow.no_pending}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {items.map((r) => (
              <TableRow
                key={r.id}
                className={cn(
                  r.has_waitlist_match && 'bg-success/[0.04] hover:!bg-success/[0.08]',
                )}
              >
                <TableCell className="tabular-nums">
                  <span className="font-medium">{formatDateYYYYMMDD(r.starts_at)}</span>
                  <br />
                  <span className="text-[13px] text-muted-foreground">
                    {formatTimeRange(r.starts_at, r.ends_at)}
                  </span>
                  {r.has_waitlist_match && (
                    <>
                      <br />
                      {/* Callout-kind badge: mixed-case, larger text,
                          comfortable padding so the row's "this fits
                          now" status reads at a glance instead of
                          requiring a squint. */}
                      <Badge
                        variant="success"
                        kind="callout"
                        className="mt-1.5 px-2 py-0.5"
                        title={t.overflow.waitlist_match_tooltip}
                      >
                        <Sparkles className="h-3 w-3" strokeWidth={2.25} />
                        {t.overflow.waitlist_match}
                      </Badge>
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <span className="font-medium">{r.customers?.full_name ?? 'Walk-in'}</span>
                  {r.customers?.email && (
                    <>
                      <br />
                      <span className="text-[13px] text-muted-foreground">{r.customers.email}</span>
                    </>
                  )}
                  {r.customers?.phone && (
                    <>
                      <br />
                      <span className="text-[13px] text-muted-foreground">{r.customers.phone}</span>
                    </>
                  )}
                </TableCell>
                <TableCell className="text-center">{r.party_size}</TableCell>
                <TableCell>{r.requested_venue?.name ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {t.source[r.source] ?? r.source}
                </TableCell>
                <TableCell className="max-w-36">
                  {r.overflow_reason ? (
                    <span className="text-warning text-[13px]">
                      {t.overflow_reason[r.overflow_reason] ?? r.overflow_reason}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {/* Quick-accept appears only when the row's badge says
                        the slot now fits — one click confirms it without
                        going through the full reassignment dialog. */}
                    {r.has_waitlist_match && (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => setQuickAcceptTarget(r)}
                      >
                        <Check />
                        {t.overflow.quick_accept}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={r.has_waitlist_match ? 'outline' : 'default'}
                      onClick={() => setReassignTarget(r)}
                    >
                      {t.overflow.reassign}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive/80 hover:text-destructive hover:bg-destructive/10"
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
