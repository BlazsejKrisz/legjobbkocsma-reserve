'use client'

import { useMemo, useState } from 'react'
import {
  Calendar,
  Clock,
  Search,
  Users,
  Check,
  AlertCircle,
  MapPin,
  Building2,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Phone,
  Mail,
  Armchair,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChannelPicker } from '@/components/notifications/ChannelPicker'
import {
  useCheckAvailability,
  useCreateFromAvailability,
  type AvailabilityRow,
} from '@/lib/hooks/availability/useAvailability'
import { fromLocalDateAndTimes, todayYYYYMMDD } from '@/lib/datetime'
import { defaultChannel, type ChannelChoice } from '@/lib/notifications/channel'
import { useT } from '@/lib/i18n/useT'
import type { Venue } from '@/lib/types/venue'

type Props = {
  venues: Venue[]
}

const DURATION_OPTIONS = [60, 90, 120, 150, 180, 210, 240]

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatTimeRange(startsAt: string, endsAt: string): string {
  return `${formatTime(startsAt)}–${formatTime(endsAt)}`
}

function groupByMatchType(rows: AvailabilityRow[]) {
  return {
    requested: rows.filter((r) => r.match_type === 'requested'),
    alt_time:  rows.filter((r) => r.match_type === 'alt_time'),
    alt_venue: rows.filter((r) => r.match_type === 'alt_venue'),
  }
}

function rowKey(r: AvailabilityRow): string {
  return `${r.venue_id}|${r.starts_at}|${r.table_ids.join(',')}`
}

// Format capacity range — combos report min == max (just total seats), so
// collapse to a single number; otherwise show the range.
function formatCapacity(min: number, max: number, paxUnit: string): string {
  if (min === max) return `${max} ${paxUnit}`
  return `${min}–${max} ${paxUnit}`
}

export function AvailabilityChecker({ venues }: Props) {
  const t = useT()
  const check = useCheckAvailability()
  const create = useCreateFromAvailability()

  // ─── Filter state ──────────────────────────────────────────────────────────
  const [venueId, setVenueId] = useState(venues[0]?.id ?? '')
  const [date, setDate] = useState(todayYYYYMMDD())
  const [time, setTime] = useState('19:00')
  const [duration, setDuration] = useState(120)
  const [partySize, setPartySize] = useState(2)

  // ─── Customer + reservation state ──────────────────────────────────────────
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [specialRequests, setSpecialRequests] = useState('')
  const [channel, setChannel] = useState<ChannelChoice>('none')
  const [channelTouched, setChannelTouched] = useState(false)

  const groups = useMemo(
    () => (check.data?.data ? groupByMatchType(check.data.data) : null),
    [check.data],
  )

  const pickedRow = useMemo(() => {
    if (!pickedKey || !check.data?.data) return null
    return check.data.data.find((r) => rowKey(r) === pickedKey) ?? null
  }, [pickedKey, check.data])

  const hasEmail = !!customerEmail.trim()
  const hasPhone = !!customerPhone.trim()
  const autoChannel = defaultChannel({ hasEmail, hasPhone })
  const effectiveChannel: ChannelChoice = channelTouched ? channel : autoChannel

  const venueLookup = useMemo(
    () => new Map(venues.map((v) => [v.id, v.name])),
    [venues],
  )

  const handleCheck = () => {
    if (!venueId) return
    const { starts_at } = fromLocalDateAndTimes(date, time, time, { allowOvernight: false })
    setPickedKey(null)
    check.mutate({
      venue_id: Number(venueId),
      starts_at,
      duration_minutes: duration,
      party_size: partySize,
      table_type_id: null,
      area: null,
      alt_time_window_minutes: 180,
      alt_time_step_minutes: 30,
    })
  }

  const handleConfirm = () => {
    if (!pickedRow) return
    if (!customerName.trim()) return
    if (!hasEmail && !hasPhone) return

    create.mutate(
      {
        venue_id: pickedRow.venue_id,
        starts_at: pickedRow.starts_at,
        duration_minutes: duration,
        party_size: partySize,
        table_ids: pickedRow.table_ids,
        source: 'phone',
        special_requests: specialRequests || null,
        customer_full_name: customerName.trim(),
        customer_email: customerEmail.trim() || null,
        customer_phone: customerPhone.trim() || null,
        notification_channel: effectiveChannel,
      },
      {
        onSuccess: () => {
          setPickedKey(null)
          setCustomerName('')
          setCustomerPhone('')
          setCustomerEmail('')
          setSpecialRequests('')
          setChannelTouched(false)
          check.reset()
        },
      },
    )
  }

  const noResults = check.data?.data && check.data.data.length === 0
  const onlyAlts =
    !!groups && groups.requested.length === 0 && (groups.alt_time.length + groups.alt_venue.length) > 0
  const hasSearched = !!check.data || check.isPending || check.isError

  return (
    <div className="flex flex-col gap-5">
      {/* ─── STEP 1: Search criteria ─────────────────────────────────────── */}
      <Section step={1} title={t.availability.filters_section} icon={Search} active={!hasSearched}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_0.8fr] gap-3">
          <Field label={t.create.venue} icon={Building2}>
            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {venues.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t.create.date} icon={Calendar}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm" />
          </Field>
          <Field label={t.create.from} icon={Clock}>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 text-sm" />
          </Field>
          <Field label={t.availability.duration} icon={Clock}>
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>{m} {t.availability.duration_minutes}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t.create.party_size} icon={Users}>
            <Input
              type="number"
              min={1}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className="h-9 text-sm"
            />
          </Field>
        </div>

        <div className="mt-4 flex items-center justify-end">
          <Button onClick={handleCheck} disabled={check.isPending} size="default" className="min-w-[140px]">
            {check.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.availability.checking}
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                {t.availability.check_button}
              </>
            )}
          </Button>
        </div>
      </Section>

      {/* ─── STEP 2: Results ─────────────────────────────────────────────── */}
      {!hasSearched && (
        <EmptyState
          icon={Sparkles}
          title="Adj meg keresési feltételeket"
          description="Töltsd ki a fenti űrlapot és kattints az „Ellenőrzés” gombra a szabad asztalok megtekintéséhez."
        />
      )}

      {check.isError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">Hiba történt az ellenőrzés közben</p>
            <p className="text-xs opacity-80">{check.error.message}</p>
          </div>
        </div>
      )}

      {noResults && (
        <EmptyState
          icon={AlertCircle}
          tone="warning"
          title="Nincs találat"
          description={t.availability.no_results}
        />
      )}

      {groups && (groups.requested.length > 0 || groups.alt_time.length > 0 || groups.alt_venue.length > 0) && (
        <Section step={2} title={onlyAlts ? t.availability.result_no_match : t.availability.requested} icon={CheckCircle2} active={!pickedRow}>
          <div className="flex flex-col gap-5">
            <ResultGroup
              title={t.availability.requested}
              icon={CheckCircle2}
              tone="success"
              rows={groups.requested}
              pickedKey={pickedKey}
              onPick={setPickedKey}
              t={t}
              currentVenueName={venueLookup.get(venueId) ?? ''}
            />
            <ResultGroup
              title={t.availability.alt_time}
              icon={Clock}
              tone="neutral"
              rows={groups.alt_time}
              pickedKey={pickedKey}
              onPick={setPickedKey}
              t={t}
              currentVenueName={venueLookup.get(venueId) ?? ''}
            />
            <ResultGroup
              title={t.availability.alt_venue}
              icon={MapPin}
              tone="neutral"
              rows={groups.alt_venue}
              pickedKey={pickedKey}
              onPick={setPickedKey}
              t={t}
              currentVenueName={venueLookup.get(venueId) ?? ''}
            />
          </div>
        </Section>
      )}

      {/* ─── STEP 3: Customer info + confirm ─────────────────────────────── */}
      {pickedRow && (
        <Section step={3} title={t.availability.customer_section} icon={Users} active>
          {/* Selection summary card — reassures the user what they picked */}
          <div className="mb-5 flex items-center gap-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary shrink-0">
              <Check className="h-5 w-5" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-primary/80 font-semibold">{t.availability.picked}</p>
              <p className="text-sm font-medium">
                <span className="text-primary">{pickedRow.venue_name}</span>
                <span className="text-muted-foreground"> · </span>
                <span className="tabular-nums">{formatTimeRange(pickedRow.starts_at, pickedRow.ends_at)}</span>
                <span className="text-muted-foreground"> · </span>
                <span>{pickedRow.combined ? t.availability.tables_label : t.availability.table_label} #{pickedRow.table_ids.join(' + #')}</span>
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setPickedKey(null)} className="text-xs h-7">
              {t.common.cancel}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Users className="h-3 w-3 text-muted-foreground" />
                {t.availability.customer_name} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-9 text-sm"
                placeholder="Kovács János"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Phone className="h-3 w-3 text-muted-foreground" />
                {t.availability.customer_phone}
              </Label>
              <Input
                type="tel"
                placeholder="+36 70 123 4567"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Mail className="h-3 w-3 text-muted-foreground" />
                {t.availability.customer_email}{' '}
                <span className="text-muted-foreground font-normal">({t.availability.customer_email_optional})</span>
              </Label>
              <Input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="h-9 text-sm"
                placeholder="vendeg@example.com"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label className="text-xs">{t.availability.special_requests}</Label>
              <Textarea
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                rows={2}
                className="text-sm resize-none"
                placeholder="…"
              />
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-border/60 bg-muted/20 p-4">
            <ChannelPicker
              value={effectiveChannel}
              onChange={(v) => { setChannelTouched(true); setChannel(v) }}
              hasEmail={hasEmail}
              hasPhone={hasPhone}
            />
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            {!hasEmail && !hasPhone ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {t.availability.contact_required}
              </span>
            ) : (
              <span />
            )}
            <Button
              onClick={handleConfirm}
              disabled={
                create.isPending ||
                !customerName.trim() ||
                (!hasEmail && !hasPhone)
              }
              size="default"
              className="min-w-[200px]"
            >
              {create.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t.availability.confirming}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {t.availability.confirm_button}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </Section>
      )}
    </div>
  )
}

// ─── Building blocks ───────────────────────────────────────────────────────────

function Section({
  step,
  title,
  icon: Icon,
  active,
  children,
}: {
  step: number
  title: string
  icon: typeof Search
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={[
      'rounded-xl border bg-card p-5 transition-colors',
      active ? 'border-primary/30 shadow-[0_0_0_3px_hsl(var(--primary)/0.04)]' : 'border-border',
    ].join(' ')}>
      <div className="flex items-center gap-2 mb-4">
        <div className={[
          'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        ].join(' ')}>
          {step}
        </div>
        <Icon className={['h-4 w-4', active ? 'text-primary' : 'text-muted-foreground'].join(' ')} />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon?: typeof Search
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        {label}
      </Label>
      {children}
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
  tone = 'neutral',
}: {
  icon: typeof Search
  title: string
  description: string
  tone?: 'neutral' | 'warning'
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-warning/30 bg-warning/5'
      : 'border-border bg-muted/20'
  const iconClass =
    tone === 'warning'
      ? 'text-warning'
      : 'text-muted-foreground'

  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-xl border ${toneClass} px-6 py-10 text-center`}>
      <Icon className={`h-8 w-8 ${iconClass}`} />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground max-w-md">{description}</p>
    </div>
  )
}

function ResultGroup({
  title,
  icon: Icon,
  rows,
  pickedKey,
  onPick,
  tone,
  t,
  currentVenueName,
}: {
  title: string
  icon: typeof Search
  rows: AvailabilityRow[]
  pickedKey: string | null
  onPick: (key: string) => void
  tone: 'success' | 'neutral'
  t: ReturnType<typeof useT>
  currentVenueName: string
}) {
  if (rows.length === 0) return null
  const headerColor = tone === 'success' ? 'text-success' : 'text-muted-foreground'
  const headerBg = tone === 'success' ? 'bg-success/10' : 'bg-muted/40'

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex h-5 w-5 items-center justify-center rounded ${headerBg}`}>
          <Icon className={`h-3 w-3 ${headerColor}`} />
        </div>
        <p className={`text-[11px] uppercase tracking-wider font-semibold ${headerColor}`}>
          {title}
        </p>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
          ({rows.length})
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {rows.map((r) => {
          const key = rowKey(r)
          const picked = pickedKey === key
          const isOtherVenue = r.venue_name !== currentVenueName

          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              className={[
                'group flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-all',
                picked
                  ? 'border-primary bg-primary/10 shadow-[0_0_0_2px_hsl(var(--primary)/0.15)]'
                  : 'border-border bg-card hover:border-border/80 hover:bg-muted/30',
              ].join(' ')}
            >
              {/* Time pill */}
              <div className={[
                'flex flex-col items-center justify-center rounded-md px-2.5 py-1.5 shrink-0 min-w-[64px]',
                picked ? 'bg-primary/20 text-primary' : 'bg-muted/50 text-foreground',
              ].join(' ')}>
                <span className="text-base font-bold tabular-nums leading-tight">
                  {formatTime(r.starts_at)}
                </span>
                <span className="text-[10px] opacity-70 tabular-nums leading-tight">
                  {formatTime(r.ends_at)}
                </span>
              </div>

              {/* Body */}
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                {isOtherVenue && (
                  <span className="text-[10px] uppercase tracking-wider text-warning flex items-center gap-1 font-semibold">
                    <MapPin className="h-2.5 w-2.5" />
                    {r.venue_name}
                  </span>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Armchair className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {r.combined ? t.availability.tables_label : t.availability.table_label}{' '}
                    #{r.table_ids.join(' + #')}
                  </span>
                  {r.combined && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 px-1 py-0.5 rounded bg-muted/40">
                      {t.availability.combined_label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Users className="h-2.5 w-2.5" />
                  <span className="tabular-nums">
                    {formatCapacity(r.capacity_min, r.capacity_max, t.availability.pax_unit)}
                  </span>
                </div>
              </div>

              {/* Picked indicator */}
              {picked ? (
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
