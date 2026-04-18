'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from './StatusBadge'
import { useReservation, useReservationEvents } from '@/lib/hooks/reservations/useReservations'
import { useUpdateReservation, useMarkConfirmationEmailSent, useRevertCancellation } from '@/lib/hooks/reservations/useUpdateReservation'
import { formatTimeRange, formatDateYYYYMMDD, toLocalDateTimeInputs, fromLocalDateAndTimes } from '@/lib/datetime'
import { OVERFLOW_REASON_LABELS, SOURCE_LABELS } from '@/lib/domain/reservation'
import type { Reservation, ReservationEvent } from '@/lib/types/reservation'

type Props = {
  reservationId: string | null
  onClose: () => void
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value ?? '—'}</span>
    </div>
  )
}

function EventLog({ reservationId }: { reservationId: string }) {
  const { data, isLoading } = useReservationEvents(reservationId)
  const events: ReservationEvent[] = data?.data ?? []

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>
  if (events.length === 0) return <p className="text-xs text-muted-foreground italic">No events yet.</p>

  return (
    <ol className="space-y-2">
      {events.map((ev) => (
        <li key={ev.id} className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium">{ev.event_type.replace(/_/g, ' ')}</span>
            <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">
              {new Date(ev.created_at).toLocaleString()}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}

// ─── Edit dialog ──────────────────────────────────────────────────────────────

function EditReservationDialog({
  reservation,
  open,
  onClose,
}: {
  reservation: Reservation
  open: boolean
  onClose: () => void
}) {
  const update = useUpdateReservation()
  const c = reservation.customers

  const startIn = toLocalDateTimeInputs(reservation.starts_at)
  const endIn = toLocalDateTimeInputs(reservation.ends_at)

  const [fullName, setFullName] = useState(c?.full_name ?? '')
  const [phone, setPhone] = useState(c?.phone ?? '')
  const [email, setEmail] = useState(c?.email ?? '')
  const [partySize, setPartySize] = useState(String(reservation.party_size))
  const [startDate, setStartDate] = useState(startIn.date)
  const [startTime, setStartTime] = useState(startIn.time)
  const [endTime, setEndTime] = useState(endIn.time)
  const [specialRequests, setSpecialRequests] = useState(reservation.special_requests ?? '')
  const [internalNotes, setInternalNotes] = useState(reservation.internal_notes ?? '')

  const handleSave = () => {
    const times = fromLocalDateAndTimes(startDate, startTime, endTime, { allowOvernight: true })
    update.mutate(
      {
        id: reservation.id,
        customer_full_name: fullName || undefined,
        customer_phone: phone || null,
        customer_email: email || null,
        party_size: partySize ? Number(partySize) : undefined,
        starts_at: times.starts_at,
        ends_at: times.ends_at,
        special_requests: specialRequests || null,
        internal_notes: internalNotes || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit reservation</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="text-sm h-8" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="text-sm h-8" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="text-sm h-8" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Party size</Label>
              <Input
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                type="number"
                min={1}
                className="text-sm h-8"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-sm h-8" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Start time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-sm h-8" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">End time</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="text-sm h-8" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Special requests</Label>
            <Textarea
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              rows={2}
              className="text-sm resize-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Internal notes</Label>
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={2}
              className="text-sm resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Detail content ───────────────────────────────────────────────────────────

function DetailContent({ reservation }: { reservation: Reservation }) {
  const [notes, setNotes] = useState(reservation.internal_notes ?? '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const update = useUpdateReservation()
  const markEmailSent = useMarkConfirmationEmailSent()
  const revert = useRevertCancellation()

  const customer = reservation.customers
  const timeRange = formatTimeRange(reservation.starts_at, reservation.ends_at)
  const date = formatDateYYYYMMDD(reservation.starts_at)
  const assignedTables = reservation.reservation_tables?.filter((rt) => !rt.released_at) ?? []

  return (
    <div className="flex flex-col gap-5 py-4">
      <EditReservationDialog
        reservation={reservation}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-medium">{customer?.full_name ?? 'Walk-in'}</p>
          {customer?.email && <p className="text-xs text-muted-foreground">{customer.email}</p>}
          {customer?.phone && (
            <a href={`tel:${customer.phone}`} className="text-xs text-muted-foreground hover:underline">
              {customer.phone}
            </a>
          )}
        </div>
        <StatusBadge status={reservation.status} />
      </div>

      <Separator />

      {/* Key fields */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date" value={date} />
        <Field label="Time" value={timeRange} />
        <Field label="Party size" value={reservation.party_size} />
        <Field label="Source" value={SOURCE_LABELS[reservation.source] ?? reservation.source} />
        <Field label="Requested venue" value={reservation.requested_venue?.name} />
        <Field
          label="Assigned venue"
          value={
            reservation.assigned_venue
              ? reservation.assigned_venue.name
              : <span className="text-amber-400">Not assigned</span>
          }
        />
        {reservation.overflow_reason && (
          <Field
            label="Overflow reason"
            value={
              <span className="text-amber-400 text-xs">
                {OVERFLOW_REASON_LABELS[reservation.overflow_reason] ?? reservation.overflow_reason}
              </span>
            }
          />
        )}
        <Field
          label="Auto confirmation"
          value={
            reservation.auto_confirmation_email_sent_at
              ? new Date(reservation.auto_confirmation_email_sent_at).toLocaleString()
              : 'Not sent'
          }
        />
        <Field
          label="Manual confirmation"
          value={
            reservation.manual_confirmation_email_sent_at
              ? new Date(reservation.manual_confirmation_email_sent_at).toLocaleString()
              : 'Not sent'
          }
        />
      </div>

      {/* Assigned tables */}
      {assignedTables.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Assigned tables
            </span>
            <div className="flex flex-wrap gap-1.5">
              {assignedTables.map((rt) => (
                <Badge key={rt.id} variant="outline" className="text-xs font-mono">
                  {rt.tables?.name ?? rt.table_id.slice(0, 8)}
                  {rt.tables?.area && (
                    <span className="ml-1 text-muted-foreground">· {rt.tables.area}</span>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Special requests */}
      {reservation.special_requests && (
        <>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Special requests
            </span>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {reservation.special_requests}
            </p>
          </div>
        </>
      )}

      <Separator />

      {/* Internal notes */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Internal notes
        </span>
        {editingNotes ? (
          <div className="flex flex-col gap-2">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: reservation.id, internal_notes: notes || null },
                    { onSuccess: () => setEditingNotes(false) },
                  )
                }
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setNotes(reservation.internal_notes ?? '')
                  setEditingNotes(false)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="cursor-pointer rounded-md border border-transparent px-1 py-0.5 text-sm text-muted-foreground hover:border-border hover:text-foreground"
            onClick={() => setEditingNotes(true)}
          >
            {notes || <span className="italic">Click to add notes…</span>}
          </div>
        )}
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {reservation.status !== 'cancelled' && (
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
        )}
        {reservation.status === 'confirmed' && !reservation.manual_confirmation_email_sent_at && (
          <Button
            size="sm"
            variant="outline"
            disabled={markEmailSent.isPending}
            onClick={() => markEmailSent.mutate(reservation.id)}
          >
            Mark email sent
          </Button>
        )}
        {(reservation.status === 'confirmed' || reservation.status === 'pending_manual_review') && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: reservation.id, status: 'completed' })}
            >
              Mark completed
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-400 hover:text-red-300"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: reservation.id, status: 'cancelled' })}
            >
              Cancel
            </Button>
          </>
        )}
        {reservation.status === 'confirmed' && (
          <Button
            size="sm"
            variant="outline"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: reservation.id, status: 'no_show' })}
          >
            No show
          </Button>
        )}
        {reservation.status === 'cancelled' && (
          <Button
            size="sm"
            variant="outline"
            className="text-green-500 hover:text-green-400"
            disabled={revert.isPending}
            onClick={() => revert.mutate(reservation.id)}
          >
            {revert.isPending ? 'Restoring…' : 'Restore to confirmed'}
          </Button>
        )}
      </div>

      <Separator />

      {/* Event log */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Event history
        </span>
        <EventLog reservationId={reservation.id} />
      </div>
    </div>
  )
}

export function ReservationDetail({ reservationId, onClose }: Props) {
  const { data, isLoading } = useReservation(reservationId)
  const reservation = data?.data

  return (
    <Sheet open={!!reservationId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-sm">Reservation detail</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        )}
        {!isLoading && !reservation && (
          <div className="py-8 text-center text-sm text-muted-foreground">Not found.</div>
        )}
        {reservation && <DetailContent reservation={reservation} />}
      </SheetContent>
    </Sheet>
  )
}
