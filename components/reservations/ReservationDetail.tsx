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
  DialogDescription,
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
import { useUpdateReservation, useMarkConfirmationEmailSent, useRevertCancellation, useChangeTables, useMoveToOverflow } from '@/lib/hooks/reservations/useUpdateReservation'
import { useAvailableTables } from '@/lib/hooks/venues/useTables'
import { useCheckAvailability } from '@/lib/hooks/availability/useAvailability'
import { Search, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import type { AvailableTable } from '@/lib/types/venueGroup'
import { formatTimeRange, formatDateYYYYMMDD, toLocalDateTimeInputs, fromLocalDateAndTimes } from '@/lib/datetime'
import { OVERFLOW_REASON_LABELS, SOURCE_LABELS } from '@/lib/domain/reservation'
import type { Reservation, ReservationEvent } from '@/lib/types/reservation'
import { useT } from '@/lib/i18n/useT'

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
  const t = useT()
  const { data, isLoading } = useReservationEvents(reservationId)
  const events: ReservationEvent[] = data?.data ?? []

  if (isLoading) return <p className="text-xs text-muted-foreground">{t.common.loading}</p>
  if (events.length === 0) return <p className="text-xs text-muted-foreground italic">{t.detail.no_events}</p>

  return (
    <ol className="space-y-2">
      {events.map((ev) => (
        <li key={ev.id} className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium">{formatEventLabel(ev, t)}</span>
            <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">
              {new Date(ev.created_at).toLocaleString()}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}

// Maps the event's raw type + new_value payload to a human-friendly label
// in the active locale.  Confirmation events specifically read
// new_value.channel so SMS sends don't get labelled as email.
function formatEventLabel(ev: ReservationEvent, t: ReturnType<typeof useT>): string {
  const type = ev.event_type
  const labels = t.detail.events as Record<string, string>

  if (type === 'confirmation_email_sent') {
    const channel = (ev.new_value as { channel?: string } | null)?.channel
    if (channel === 'sms') return labels.confirmation_sms_sent
    return labels.confirmation_email_sent
  }

  return labels[type] ?? type.replace(/_/g, ' ')
}

// ─── Change tables dialog ─────────────────────────────────────────────────────

function ChangeTablesDialog({
  reservation,
  open,
  onClose,
}: {
  reservation: Reservation
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  const changeTables = useChangeTables()

  const venueId = String(reservation.assigned_venue_id ?? reservation.requested_venue_id)
  const { data, isLoading } = useAvailableTables(venueId, reservation.starts_at, reservation.ends_at)
  const tables: AvailableTable[] = data?.data ?? []

  const currentTableIds = (reservation.reservation_tables ?? [])
    .filter((rt) => !rt.released_at)
    .map((rt) => String(rt.table_id))

  const [selectedIds, setSelectedIds] = useState<string[]>(currentTableIds)

  const toggle = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const selectedTables = tables.filter((t) => selectedIds.includes(String(t.table_id)))
  const totalCapacity = selectedTables.reduce((sum, t) => sum + t.capacity_max, 0)
  const capacityWarning = selectedIds.length > 0 && totalCapacity < reservation.party_size

  const handleSave = () => {
    changeTables.mutate(
      { reservationId: reservation.id, new_table_ids: selectedIds.map(Number) },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.detail.change_tables_title}</DialogTitle>
          <DialogDescription>
            {reservation.party_size} {t.common.pax} · {reservation.assigned_venue?.name ?? reservation.requested_venue?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {isLoading && <p className="text-xs text-muted-foreground py-2">{t.common.loading}</p>}
          {!isLoading && tables.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 italic">{t.detail.change_tables_no_tables}</p>
          )}
          {!isLoading && tables.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
              {tables.map((tbl) => {
                const checked = selectedIds.includes(String(tbl.table_id))
                const fitsAlone = tbl.capacity_min <= reservation.party_size && tbl.capacity_max >= reservation.party_size
                return (
                  <label
                    key={tbl.table_id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      !tbl.is_free
                        ? 'opacity-40 cursor-not-allowed border-border'
                        : checked
                          ? 'cursor-pointer border-ring bg-accent'
                          : 'cursor-pointer border-border hover:border-ring/50 hover:bg-accent/40'
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={!tbl.is_free}
                      onCheckedChange={() => tbl.is_free && toggle(String(tbl.table_id))}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{tbl.table_name}</span>
                      {tbl.area && <span className="ml-1.5 text-muted-foreground text-xs">· {tbl.area}</span>}
                    </div>
                    <span className={`shrink-0 text-xs tabular-nums ${fitsAlone ? 'text-muted-foreground' : 'text-amber-400'}`}>
                      {tbl.capacity_min}–{tbl.capacity_max} {t.common.pax}
                    </span>
                    <span className={`shrink-0 h-2 w-2 rounded-full ${tbl.is_free ? 'bg-green-500' : 'bg-red-500/60'}`} />
                  </label>
                )
              })}
            </div>
          )}
          {capacityWarning && (
            <p className="text-xs text-amber-400">⚠ {t.detail.change_tables_capacity_warning}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t.common.cancel}</Button>
          <Button onClick={handleSave} disabled={changeTables.isPending || selectedIds.length === 0}>
            {changeTables.isPending ? t.common.saving : t.detail.change_tables_save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const t = useT()
  const update = useUpdateReservation()
  const moveToOverflow = useMoveToOverflow()
  const checkAvail = useCheckAvailability()
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

  // Tracks the result of an availability check the user explicitly ran.
  // Reset whenever any "schedule-relevant" field changes so the UI doesn't
  // suggest a stale verdict.
  const [availResult, setAvailResult] = useState<'has_match' | 'no_match' | null>(null)

  // Tables go bad when starts_at, ends_at, or party_size change relative to
  // what the reservation currently has assigned.  Notes / customer-info
  // edits don't need a re-check.
  const scheduleChanged =
    startDate !== startIn.date ||
    startTime !== startIn.time ||
    endTime   !== endIn.time   ||
    Number(partySize) !== reservation.party_size

  // Reset the check verdict whenever the schedule fields move.
  const lastSig = `${startDate}|${startTime}|${endTime}|${partySize}`
  const [lastCheckedSig, setLastCheckedSig] = useState<string | null>(null)
  if (availResult && lastCheckedSig !== null && lastSig !== lastCheckedSig) {
    setAvailResult(null)
    setLastCheckedSig(null)
  }

  const venueId =
    reservation.assigned_venue_id ??
    reservation.requested_venue_id ??
    null

  const handleCheckAvailability = () => {
    if (!venueId) return
    const times = fromLocalDateAndTimes(startDate, startTime, endTime, { allowOvernight: true })
    const durationMinutes = Math.round(
      (new Date(times.ends_at).getTime() - new Date(times.starts_at).getTime()) / 60_000,
    )
    checkAvail.mutate(
      {
        venue_id: Number(venueId),
        starts_at: times.starts_at,
        duration_minutes: durationMinutes,
        party_size: Number(partySize),
        table_type_id: null,
        area: null,
        alt_time_window_minutes: 60,
        alt_time_step_minutes: 30,
        // Crucial: pretend this reservation's own tables aren't booked.
        // Otherwise moving 19:00→20:00 at the same tables would say "no
        // fit" because they're "occupied" by the current booking at 19:00.
        exclude_reservation_id: Number(reservation.id),
      },
      {
        onSuccess: (res) => {
          const hasMatch = (res.data ?? []).some((r) => r.match_type === 'requested')
          setAvailResult(hasMatch ? 'has_match' : 'no_match')
          setLastCheckedSig(lastSig)
        },
      },
    )
  }

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

  const handleSaveToOverflow = () => {
    const times = fromLocalDateAndTimes(startDate, startTime, endTime, { allowOvernight: true })
    moveToOverflow.mutate(
      {
        reservationId: reservation.id,
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
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.detail.edit_title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          {/* Customer block — name full row, phone + email in 2 cols. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 flex flex-col gap-1">
              <Label className="text-xs">{t.detail.full_name}</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="text-sm h-8" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t.detail.phone}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="text-sm h-8" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t.detail.email}</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="text-sm h-8" />
            </div>
          </div>

          {/* Schedule + party — single row of 4 on tablet+, stacks on phone.
              Keeps the dialog short even when the availability check card
              expands below. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t.detail.date}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-sm h-8" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t.detail.start_time}</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-sm h-8" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t.detail.end_time}</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="text-sm h-8" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t.detail.party_size}</Label>
              <Input
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                type="number"
                min={1}
                className="text-sm h-8"
              />
            </div>
          </div>
          {/* Notes side-by-side at this width — special requests is what
              the guest wrote, internal notes is what staff wrote.  Stack
              on phone for readability. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t.detail.special_requests}</Label>
              <Textarea
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t.detail.internal_notes}</Label>
              <Textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>

          {/* ─── Availability check (only when schedule-relevant fields differ) ── */}
          {scheduleChanged && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">{t.detail.availability_check_title}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCheckAvailability}
                  disabled={checkAvail.isPending || !venueId}
                  className="h-7"
                >
                  {checkAvail.isPending ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> {t.detail.availability_checking}</>
                  ) : (
                    <><Search className="h-3 w-3" /> {t.detail.availability_check_button}</>
                  )}
                </Button>
              </div>
              {availResult === 'has_match' && (
                <p className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  {t.detail.availability_has_match}
                </p>
              )}
              {availResult === 'no_match' && (
                <p className="flex items-center gap-1.5 text-[11px] text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  {t.detail.availability_no_match}
                </p>
              )}
              {!availResult && (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {t.detail.availability_check_hint}
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t.common.cancel}</Button>
          {scheduleChanged && availResult === 'no_match' ? (
            <Button
              onClick={handleSaveToOverflow}
              disabled={moveToOverflow.isPending}
              className="bg-amber-500 hover:bg-amber-500/90 text-amber-950"
            >
              {moveToOverflow.isPending ? t.common.saving : t.detail.save_to_overflow}
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={update.isPending || (scheduleChanged && availResult === null)}
              title={scheduleChanged && availResult === null ? t.detail.availability_check_required : undefined}
            >
              {update.isPending ? t.common.saving : t.detail.save_changes}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Detail content ───────────────────────────────────────────────────────────

function DetailContent({ reservation }: { reservation: Reservation }) {
  const t = useT()
  const [notes, setNotes] = useState(reservation.internal_notes ?? '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [changeTablesOpen, setChangeTablesOpen] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const update = useUpdateReservation()
  const markEmailSent = useMarkConfirmationEmailSent()
  const revert = useRevertCancellation()

  const customer = reservation.customers
  const timeRange = formatTimeRange(reservation.starts_at, reservation.ends_at)
  const date = formatDateYYYYMMDD(reservation.starts_at)
  const assignedTables = reservation.reservation_tables?.filter((rt) => !rt.released_at) ?? []
  const confirmCancellation = () => {
    update.mutate(
      { id: reservation.id, status: 'cancelled' },
      { onSuccess: () => setCancelConfirmOpen(false) },
    )
  }

  return (
    <div className="flex flex-col gap-5 px-2 py-4 sm:px-3">
      <EditReservationDialog
        reservation={reservation}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
      <ChangeTablesDialog
        reservation={reservation}
        open={changeTablesOpen}
        onClose={() => setChangeTablesOpen(false)}
      />
      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.detail.cancel_title}</DialogTitle>
            <DialogDescription>
              {t.detail.cancel_description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelConfirmOpen(false)}>
              {t.common.back}
            </Button>
            <Button
              variant="destructive"
              disabled={update.isPending}
              onClick={confirmCancellation}
            >
              {update.isPending ? t.detail.cancelling : t.detail.confirm_cancellation}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-medium">{customer?.full_name ?? t.common.walk_in}</p>
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
        <Field label={t.detail.date} value={date} />
        <Field label={t.detail.time} value={timeRange} />
        <Field label={t.detail.party_size} value={reservation.party_size} />
        <Field label={t.detail.source} value={SOURCE_LABELS[reservation.source] ?? reservation.source} />
        <Field label={t.detail.requested_venue} value={reservation.requested_venue?.name} />
        <Field
          label={t.detail.assigned_venue}
          value={
            reservation.assigned_venue
              ? reservation.assigned_venue.name
              : <span className="text-amber-400">{t.detail.not_assigned}</span>
          }
        />
        {reservation.overflow_reason && (
          <Field
            label={t.detail.overflow_reason}
            value={
              <span className="text-amber-400 text-xs">
                {OVERFLOW_REASON_LABELS[reservation.overflow_reason] ?? reservation.overflow_reason}
              </span>
            }
          />
        )}
        <Field
          label={t.detail.auto_confirmation}
          value={
            reservation.auto_confirmation_email_sent_at
              ? new Date(reservation.auto_confirmation_email_sent_at).toLocaleString()
              : t.detail.not_sent
          }
        />
        <Field
          label={t.detail.manual_confirmation}
          value={
            reservation.manual_confirmation_email_sent_at
              ? new Date(reservation.manual_confirmation_email_sent_at).toLocaleString()
              : t.detail.not_sent
          }
        />
      </div>

      {/* Assigned tables */}
      {assignedTables.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {t.detail.assigned_tables}
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
              {t.detail.special_requests}
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
          {t.detail.internal_notes}
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
                {t.common.save}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setNotes(reservation.internal_notes ?? '')
                  setEditingNotes(false)
                }}
              >
                {t.common.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="cursor-pointer rounded-md border border-transparent px-1 py-0.5 text-sm text-muted-foreground hover:border-border hover:text-foreground"
            onClick={() => setEditingNotes(true)}
          >
            {notes || <span className="italic">{t.detail.click_to_add_notes}</span>}
          </div>
        )}
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex flex-col gap-3">
        {/* Primary edit actions — what staff use most often, kept on a
            dedicated row above the status-change buttons. */}
        {reservation.status !== 'cancelled' && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setEditOpen(true)}
              className="font-medium"
            >
              {t.common.edit}
            </Button>
            {reservation.status === 'confirmed' && reservation.assigned_venue_id && (
              <Button
                size="sm"
                onClick={() => setChangeTablesOpen(true)}
                className="font-medium"
              >
                {t.detail.change_tables}
              </Button>
            )}
          </div>
        )}

        {/* Secondary status-change actions */}
        <div className="flex flex-wrap gap-2">
          {reservation.status === 'confirmed' && !reservation.manual_confirmation_email_sent_at && (
            <Button
              size="sm"
              variant="outline"
              disabled={markEmailSent.isPending}
              onClick={() => markEmailSent.mutate(reservation.id)}
            >
              {t.detail.mark_email_sent}
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
                {t.detail.mark_completed}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-400 hover:text-red-300"
                disabled={update.isPending}
                onClick={() => setCancelConfirmOpen(true)}
              >
                {t.detail.cancel_action}
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
              {t.detail.no_show}
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
              {revert.isPending ? t.detail.restoring : t.detail.restore}
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Event log */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {t.detail.event_history}
        </span>
        <EventLog reservationId={reservation.id} />
      </div>
    </div>
  )
}

export function ReservationDetail({ reservationId, onClose }: Props) {
  const t = useT()
  const { data, isLoading } = useReservation(reservationId)
  const reservation = data?.data

  return (
    <Sheet open={!!reservationId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-sm">{t.detail.title}</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="py-8 text-center text-sm text-muted-foreground">{t.common.loading}</div>
        )}
        {!isLoading && !reservation && (
          <div className="py-8 text-center text-sm text-muted-foreground">{t.common.not_found}</div>
        )}
        {reservation && <DetailContent reservation={reservation} />}
      </SheetContent>
    </Sheet>
  )
}
