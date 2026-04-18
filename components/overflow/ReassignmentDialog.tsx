'use client'

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { useReallocationOptions, useReassignReservation } from '@/lib/hooks/overflow/useOverflow'
import { useAvailableTables } from '@/lib/hooks/venues/useTables'
import { useVenues } from '@/lib/hooks/venues/useVenues'
import { formatTimeRange, formatDateYYYYMMDD, toLocalDateTimeInputs, fromLocalDateAndTimes } from '@/lib/datetime'
import { OVERFLOW_REASON_LABELS } from '@/lib/domain/reservation'
import type { Reservation, ReallocationOption } from '@/lib/types/reservation'
import type { AvailableTable } from '@/lib/types/venueGroup'

// ─── Info field ───────────────────────────────────────────────────────────────

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{children ?? '—'}</span>
    </div>
  )
}

// ─── Option card ──────────────────────────────────────────────────────────────

function OptionCard({
  option,
  selected,
  onSelect,
}: {
  option: ReallocationOption
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3.5 transition-colors ${
        selected
          ? 'border-ring bg-accent'
          : 'border-border hover:border-ring/50 hover:bg-accent/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-medium text-sm truncate">{option.venue_name}</span>
          {option.note && (
            <span className="text-xs text-muted-foreground">{option.note}</span>
          )}
          <span className="text-xs text-muted-foreground tabular-nums mt-0.5">
            {formatDateYYYYMMDD(option.starts_at)} · {formatTimeRange(option.starts_at, option.ends_at)}
          </span>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
          {option.table_ids.length} table{option.table_ids.length > 1 ? 's' : ''}
        </Badge>
      </div>
    </button>
  )
}

// ─── Manual table picker ──────────────────────────────────────────────────────

function TablePicker({
  venueId,
  startsAt,
  endsAt,
  selectedIds,
  partySize,
  onToggle,
}: {
  venueId: string
  startsAt: string
  endsAt: string
  selectedIds: string[]
  partySize: number
  onToggle: (id: string) => void
}) {
  const { data, isLoading } = useAvailableTables(venueId, startsAt, endsAt)
  const tables: AvailableTable[] = data?.data ?? []

  const selectedTables = tables.filter((t) => selectedIds.includes(String(t.table_id)))
  const totalCapacity = selectedTables.reduce((sum, t) => sum + t.capacity_max, 0)
  const isUnderCapacity = selectedIds.length > 0 && totalCapacity < partySize
  const isOverCapacity = selectedIds.length > 0 && selectedTables.every((t) => t.capacity_min > partySize)

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading tables…</p>
  if (tables.length === 0) return <p className="text-xs text-muted-foreground py-2 italic">No tables found.</p>

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
        {tables.map((t) => {
          const checked = selectedIds.includes(String(t.table_id))
          const fitsAlone = t.capacity_min <= partySize && t.capacity_max >= partySize
          const tooSmall = t.capacity_max < partySize
          return (
            <label
              key={t.table_id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                !t.is_free
                  ? 'opacity-40 cursor-not-allowed border-border'
                  : checked
                    ? 'cursor-pointer border-ring bg-accent'
                    : 'cursor-pointer border-border hover:border-ring/50 hover:bg-accent/40'
              }`}
            >
              <Checkbox
                checked={checked}
                disabled={!t.is_free}
                onCheckedChange={() => t.is_free && onToggle(String(t.table_id))}
              />
              <div className="flex-1 min-w-0">
                <span className="font-medium">{t.table_name}</span>
                {t.area && <span className="ml-1.5 text-muted-foreground text-xs">· {t.area}</span>}
              </div>
              <span className={`shrink-0 text-xs tabular-nums ${fitsAlone ? 'text-muted-foreground' : tooSmall ? 'text-amber-400' : 'text-muted-foreground'}`}>
                {t.capacity_min}–{t.capacity_max} pax
              </span>
              <span className={`shrink-0 h-2 w-2 rounded-full ${t.is_free ? 'bg-green-500' : 'bg-red-500/60'}`} />
            </label>
          )
        })}
      </div>

      {/* Capacity warnings */}
      {isUnderCapacity && (
        <p className="text-xs text-amber-400 flex items-center gap-1.5">
          <span>⚠</span>
          Selected tables fit {totalCapacity} pax combined — party is {partySize}. Add more tables or confirm override.
        </p>
      )}
      {isOverCapacity && (
        <p className="text-xs text-amber-400 flex items-center gap-1.5">
          <span>⚠</span>
          Selected table minimum is {selectedTables[0]?.capacity_min} pax — party is only {partySize}.
        </p>
      )}
    </div>
  )
}

// ─── Reassign form ────────────────────────────────────────────────────────────

function ReassignForm({ reservation, onClose }: { reservation: Reservation; onClose: () => void }) {
  const { data, isLoading } = useReallocationOptions(reservation.id)
  const reassign = useReassignReservation()
  const { data: venuesData } = useVenues()

  // Suggested-option tab state
  const [selectedOption, setSelectedOption] = useState<ReallocationOption | null>(null)
  const [suggestedSubTab, setSuggestedSubTab] = useState<'change_venue' | 'change_time'>('change_venue')

  // Manual picker state
  const [manualVenueId, setManualVenueId] = useState(reservation.requested_venue_id)
  const startInputs = toLocalDateTimeInputs(reservation.starts_at)
  const endInputs = toLocalDateTimeInputs(reservation.ends_at)
  const [manualDate, setManualDate] = useState(startInputs.date)
  const [manualStartTime, setManualStartTime] = useState(startInputs.time)
  const [manualEndTime, setManualEndTime] = useState(endInputs.time)
  const [manualTableIds, setManualTableIds] = useState<string[]>([])

  const manualTimes = useMemo(() => {
    try {
      return fromLocalDateAndTimes(manualDate, manualStartTime, manualEndTime, { allowOvernight: true })
    } catch {
      return null
    }
  }, [manualDate, manualStartTime, manualEndTime])

  // Shared state
  const [note, setNote] = useState('')
  const [sendEmail, setSendEmail] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [activeTab, setActiveTab] = useState<'suggested' | 'manual'>('suggested')

  const options: ReallocationOption[] = data?.data ?? []
  const allVenues = venuesData?.data ?? []

  // Split options by change type — coerce to string because the RPC returns venue_id as bigint
  const changeVenueOptions = options.filter(
    (o) => String(o.venue_id) !== String(reservation.requested_venue_id)
  )
  // "Change time" tab = same venue options (same time OR different time)
  const changeTimeOptions = options.filter(
    (o) => String(o.venue_id) === String(reservation.requested_venue_id)
  )

  // Group options within each sub-tab by option_kind
  const groupBy = (opts: ReallocationOption[]) =>
    opts.reduce<Record<string, ReallocationOption[]>>((acc, opt) => {
      if (!acc[opt.option_kind]) acc[opt.option_kind] = []
      acc[opt.option_kind].push(opt)
      return acc
    }, {})

  const changeVenueGrouped = groupBy(changeVenueOptions)
  const changeTimeGrouped = groupBy(changeTimeOptions)

  const OPTION_KIND_LABELS: Record<string, string> = {
    same_venue_same_time:           'Same venue · Same time',
    same_venue_same_time_combined:  'Same venue · Same time · Combined tables',
    same_venue_other_time:          'Alternative time',
    group_venue_same_time:          'Group venue',
    group_venue_same_time_combined: 'Group venue · Combined tables',
    other_venue_same_time:          'Other venue',
    other_venue_same_time_combined: 'Other venue · Combined tables',
  }

  const toggleManualTable = (id: string) =>
    setManualTableIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )

  const canCommitManual = manualTableIds.length > 0 && !!manualTimes

  const handleCommit = () => {
    if (activeTab === 'suggested' && selectedOption) {
      reassign.mutate(
        {
          reservationId: reservation.id,
          new_table_ids: selectedOption.table_ids.map(Number),
          new_venue_id: Number(selectedOption.venue_id),
          new_starts_at: selectedOption.starts_at,
          new_ends_at: selectedOption.ends_at,
          customer_service_note: note || undefined,
          send_confirmation_email: sendEmail,
        },
        { onSuccess: onClose },
      )
    } else if (activeTab === 'manual' && canCommitManual && manualTimes) {
      reassign.mutate(
        {
          reservationId: reservation.id,
          new_table_ids: manualTableIds.map(Number),
          new_venue_id: Number(manualVenueId),
          new_starts_at: manualTimes.starts_at,
          new_ends_at: manualTimes.ends_at,
          customer_service_note: note || undefined,
          send_confirmation_email: sendEmail,
        },
        { onSuccess: onClose },
      )
    }
  }

  const canProceed = activeTab === 'suggested' ? !!selectedOption : canCommitManual
  const destinationLabel =
    activeTab === 'suggested'
      ? selectedOption?.venue_name
      : allVenues.find((v) => String(v.id) === String(manualVenueId))?.name ??
        reservation.requested_venue?.name

  // ── Confirmation screen ────────────────────────────────────────────────────
  if (confirming) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-foreground">
          Reassign to <strong>{destinationLabel}</strong>
          {sendEmail && (
            <span className="text-amber-400"> and send confirmation email to guest immediately</span>
          )}?
        </p>
        {note && (
          <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Customer service note: </span>
            {note}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setConfirming(false)}>Back</Button>
          <Button onClick={handleCommit} disabled={reassign.isPending}>
            {reassign.isPending ? 'Reassigning…' : 'Confirm reassignment'}
          </Button>
        </DialogFooter>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">

      {/* ── Reservation info ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3.5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <InfoField label="Guest">
            {reservation.customers?.full_name ?? 'Walk-in'}
          </InfoField>
          <InfoField label="Phone">
            {reservation.customers?.phone
              ? (
                <a
                  href={`tel:${reservation.customers.phone}`}
                  className="hover:underline"
                >
                  {reservation.customers.phone}
                </a>
              )
              : '—'}
          </InfoField>
          <InfoField label="Email">
            {reservation.customers?.email ?? '—'}
          </InfoField>
          <InfoField label="Party size">
            {reservation.party_size} pax
          </InfoField>
          <InfoField label="Date">
            {formatDateYYYYMMDD(reservation.starts_at)}
          </InfoField>
          <InfoField label="Time">
            {formatTimeRange(reservation.starts_at, reservation.ends_at)}
          </InfoField>
          <InfoField label="Requested venue">
            {reservation.requested_venue?.name ?? '—'}
          </InfoField>
          {reservation.overflow_reason && (
            <InfoField label="Overflow reason">
              <span className="text-amber-400">
                {OVERFLOW_REASON_LABELS[reservation.overflow_reason] ?? reservation.overflow_reason}
              </span>
            </InfoField>
          )}
          {reservation.special_requests && (
            <div className="col-span-2 sm:col-span-3 flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Special requests
              </span>
              <span className="text-sm text-foreground whitespace-pre-wrap">
                {reservation.special_requests}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Mode tabs ────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'suggested' | 'manual')}>
        <TabsList className="w-full">
          <TabsTrigger value="suggested" className="flex-1 text-xs">Suggested options</TabsTrigger>
          <TabsTrigger value="manual" className="flex-1 text-xs">Manual pick</TabsTrigger>
        </TabsList>

        {/* ── Suggested options ──────────────────────────────────────────── */}
        <TabsContent value="suggested" className="mt-4">
          {isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading options…</div>
          )}
          {!isLoading && options.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No reallocation options available.
            </div>
          )}
          {!isLoading && options.length > 0 && (
            <Tabs
              value={suggestedSubTab}
              onValueChange={(v) => {
                setSuggestedSubTab(v as 'change_venue' | 'change_time')
                setSelectedOption(null)
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="change_venue" className="flex-1 text-xs">
                  Change venue
                  {changeVenueOptions.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                      {changeVenueOptions.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="change_time" className="flex-1 text-xs">
                  Change time
                  {changeTimeOptions.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                      {changeTimeOptions.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="change_venue" className="mt-3">
                {changeVenueOptions.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No alternative venues available.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4 max-h-72 overflow-y-auto pr-1">
                    {Object.entries(changeVenueGrouped).map(([type, opts]) => (
                      <div key={type}>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                          {OPTION_KIND_LABELS[type] ?? type}
                        </p>
                        <div className="flex flex-col gap-2">
                          {opts.map((opt, i) => (
                            <OptionCard
                              key={`${opt.table_ids.join('-')}-${opt.starts_at}-${i}`}
                              option={opt}
                              selected={
                                selectedOption?.table_ids.join(',') === opt.table_ids.join(',') &&
                                selectedOption?.starts_at === opt.starts_at &&
                                selectedOption?.venue_id === opt.venue_id
                              }
                              onSelect={() => setSelectedOption(opt)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="change_time" className="mt-3">
                {changeTimeOptions.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No alternative times available.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4 max-h-72 overflow-y-auto pr-1">
                    {Object.entries(changeTimeGrouped).map(([type, opts]) => (
                      <div key={type}>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                          {OPTION_KIND_LABELS[type] ?? type}
                        </p>
                        <div className="flex flex-col gap-2">
                          {opts.map((opt, i) => (
                            <OptionCard
                              key={`${opt.table_ids.join('-')}-${opt.starts_at}-${i}`}
                              option={opt}
                              selected={
                                selectedOption?.table_ids.join(',') === opt.table_ids.join(',') &&
                                selectedOption?.starts_at === opt.starts_at &&
                                selectedOption?.venue_id === opt.venue_id
                              }
                              onSelect={() => setSelectedOption(opt)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>

        {/* ── Manual picker ──────────────────────────────────────────────── */}
        <TabsContent value="manual" className="mt-4">
          <div className="flex flex-col gap-4">
            {/* Venue selector */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Venue
              </Label>
              <select
                value={manualVenueId}
                onChange={(e) => {
                  setManualVenueId(e.target.value)
                  setManualTableIds([])
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {allVenues.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            {/* Date & time */}
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Date
                </Label>
                <Input
                  type="date"
                  value={manualDate}
                  onChange={(e) => { setManualDate(e.target.value); setManualTableIds([]) }}
                  className="text-sm h-9"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  From
                </Label>
                <Input
                  type="time"
                  value={manualStartTime}
                  onChange={(e) => { setManualStartTime(e.target.value); setManualTableIds([]) }}
                  className="text-sm h-9"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Until
                </Label>
                <Input
                  type="time"
                  value={manualEndTime}
                  onChange={(e) => { setManualEndTime(e.target.value); setManualTableIds([]) }}
                  className="text-sm h-9"
                />
              </div>
            </div>

            {/* Table picker */}
            {manualTimes && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Select tables
                </p>
                <TablePicker
                  venueId={manualVenueId}
                  startsAt={manualTimes.starts_at}
                  endsAt={manualTimes.ends_at}
                  selectedIds={manualTableIds}
                  partySize={reservation.party_size}
                  onToggle={toggleManualTable}
                />
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Note + email toggle ───────────────────────────────────────────── */}
      {canProceed && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium">Customer service note <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Explain the change to the guest…"
              className="text-sm resize-none"
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Send confirmation email</p>
              <p className="text-xs text-muted-foreground">Sends immediately. Cannot be undone.</p>
            </div>
            <Switch checked={sendEmail} onCheckedChange={setSendEmail} className="shrink-0 mt-0.5" />
          </div>
        </>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!canProceed} onClick={() => setConfirming(true)}>
          Review & confirm
        </Button>
      </DialogFooter>
    </div>
  )
}

// ─── Dialog wrapper ───────────────────────────────────────────────────────────

export function ReassignmentDialog({
  reservation,
  onClose,
}: {
  reservation: Reservation | null
  onClose: () => void
}) {
  return (
    <Dialog open={!!reservation} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reassign reservation</DialogTitle>
        </DialogHeader>
        {reservation && <ReassignForm reservation={reservation} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
