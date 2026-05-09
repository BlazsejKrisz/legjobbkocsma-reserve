'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Mail,
  MessageSquare,
  Check,
  X,
  RefreshCw,
  Clock,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatCard as SharedStatCard } from '@/components/layout/StatCard'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useNotifications,
  useNotificationStats,
  useRetryNotification,
  type NotificationRow,
} from '@/lib/hooks/notifications/useNotifications'
import { useT } from '@/lib/i18n/useT'

const PAGE_SIZE = 50

const STATUS_TONE: Record<NotificationRow['status'], string> = {
  sent:    'border-success/30 bg-success/10 text-success',
  failed:  'border-warning/30 bg-warning/10 text-warning',
  dead:    'border-destructive/30 bg-destructive/10 text-destructive',
  pending: 'border-info/30 bg-info/10 text-info',
  sending: 'border-info/30 bg-info/10 text-info',
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay) return time
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

function maskRecipient(value: string, channel: 'email' | 'sms'): string {
  // Light masking for at-a-glance scans without leaking full PII into screenshots.
  if (channel === 'email') {
    const [local, domain] = value.split('@')
    if (!local || !domain) return value
    const visible = local.length <= 2 ? local : local.slice(0, 2) + '…'
    return `${visible}@${domain}`
  }
  // sms: show country code + last 3 digits
  if (value.length <= 6) return value
  return `${value.slice(0, 4)}…${value.slice(-3)}`
}

export function NotificationsList() {
  const t = useT()
  const [status, setStatus]   = useState<string>('')
  const [channel, setChannel] = useState<string>('')
  const [kind, setKind]       = useState<string>('')
  const [search, setSearch]   = useState<string>('')
  const [page, setPage]       = useState(1)

  const filters = useMemo(
    () => ({
      status: status || undefined,
      channel: channel || undefined,
      kind: kind || undefined,
      search: search || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    [status, channel, kind, search, page],
  )

  const { data, isLoading, isError } = useNotifications(filters)
  const stats = useNotificationStats()
  const retry = useRetryNotification()

  const rows = data?.data ?? []
  const total = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-5">
      {/* ── Stats cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatCard label={t.notifications.stats_sent}    value={stats.data?.data?.sent ?? 0}    tone="emerald" />
        <StatCard label={t.notifications.stats_failed}  value={stats.data?.data?.failed ?? 0}  tone="amber" />
        <StatCard label={t.notifications.stats_dead}    value={stats.data?.data?.dead ?? 0}    tone="destructive" />
        <StatCard label={t.notifications.stats_pending} value={stats.data?.data?.pending ?? 0} tone="blue" />
        <StatCard label={t.notifications.stats_sending} value={stats.data?.data?.sending ?? 0} tone="blue" />
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end gap-3 rounded-xl border border-border bg-card p-4">
        <FilterField label={t.notifications.filter_search} className="lg:flex-1 lg:min-w-[180px]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="email@..."
              className="h-9 text-sm pl-7"
            />
          </div>
        </FilterField>

        <FilterField label={t.notifications.filter_status}>
          <Select value={status || '__all'} onValueChange={(v) => { setStatus(v === '__all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="h-9 text-sm w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t.notifications.filter_all}</SelectItem>
              <SelectItem value="sent">{t.notifications.stats_sent}</SelectItem>
              <SelectItem value="failed">{t.notifications.stats_failed}</SelectItem>
              <SelectItem value="dead">{t.notifications.stats_dead}</SelectItem>
              <SelectItem value="pending">{t.notifications.stats_pending}</SelectItem>
              <SelectItem value="sending">{t.notifications.stats_sending}</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label={t.notifications.filter_channel}>
          <Select value={channel || '__all'} onValueChange={(v) => { setChannel(v === '__all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="h-9 text-sm w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t.notifications.filter_all}</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label={t.notifications.filter_kind}>
          <Select value={kind || '__all'} onValueChange={(v) => { setKind(v === '__all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="h-9 text-sm w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t.notifications.filter_all}</SelectItem>
              <SelectItem value="confirmation">{t.notifications.kind_confirmation}</SelectItem>
              <SelectItem value="received">{t.notifications.kind_received}</SelectItem>
              <SelectItem value="updated">{t.notifications.kind_updated}</SelectItem>
              <SelectItem value="reminder">{t.notifications.kind_reminder}</SelectItem>
              <SelectItem value="cancellation">{t.notifications.kind_cancellation}</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              <Th>{t.notifications.col_when}</Th>
              <Th className="hidden sm:table-cell">{t.notifications.col_kind}</Th>
              <Th>{t.notifications.col_channel}</Th>
              <Th>{t.notifications.col_to}</Th>
              <Th>{t.notifications.col_status}</Th>
              <Th className="text-center hidden md:table-cell">{t.notifications.col_attempts}</Th>
              <Th className="hidden lg:table-cell">{t.notifications.col_reservation}</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                <Loader2 className="inline h-4 w-4 animate-spin" />
              </td></tr>
            )}
            {isError && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-destructive">Error loading notifications.</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">{t.notifications.no_results}</td></tr>
            )}
            {rows.map((r) => {
              const venueName =
                r.reservation?.assigned_venue?.name ??
                r.reservation?.requested_venue?.name ??
                null
              const canRetry = r.status === 'failed' || r.status === 'dead'

              return (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-mono text-[12px] text-muted-foreground whitespace-nowrap">
                    {formatTimestamp(r.created_at)}
                  </td>
                  <td className="px-4 py-2 text-xs hidden sm:table-cell">
                    {t.notifications[`kind_${r.kind}` as const]}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-1 text-xs">
                      {r.channel === 'email'
                        ? <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        : <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />}
                      {r.channel.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {maskRecipient(r.to_address, r.channel)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge row={r} />
                    {r.last_error && (r.status === 'failed' || r.status === 'dead') && (
                      <p className="text-[10px] text-destructive/80 mt-0.5 max-w-[280px] truncate" title={r.last_error}>
                        {r.last_error}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center text-xs text-muted-foreground hidden md:table-cell">
                    {r.attempts}
                  </td>
                  <td className="px-4 py-2 text-xs hidden lg:table-cell">
                    {r.reservation_id ? (
                      <Link
                        href={`/dashboard/reservations?reservationId=${r.reservation_id}`}
                        className="text-primary hover:underline"
                      >
                        #{r.reservation_id}
                      </Link>
                    ) : '—'}
                    {venueName && (
                      <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">{venueName}</p>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {canRetry && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => retry.mutate(r.id)}
                        disabled={retry.isPending}
                        className="h-7 text-xs"
                      >
                        <RefreshCw className="h-3 w-3" />
                        {t.notifications.retry}
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
          <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}</span>
          <Button
            size="sm" variant="outline" className="h-7"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm" variant="outline" className="h-7"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Building blocks ───────────────────────────────────────────────────────────

function FilterField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={['flex flex-col gap-1.5', className].filter(Boolean).join(' ')}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={[
      'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
      className,
    ].filter(Boolean).join(' ')}>
      {children}
    </th>
  )
}

// Compact tone-mapped wrapper around the shared StatCard.  Keeps the
// existing call signature `<StatCard label value tone={'emerald' | …} />`
// at the call-sites in this file; consolidates the visual rendering
// into the shared primitive.
const NL_TONE_MAP = {
  emerald: 'success',
  amber: 'warning',
  destructive: 'destructive',
  blue: 'info',
} as const

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: keyof typeof NL_TONE_MAP
}) {
  return (
    <SharedStatCard
      layout="compact"
      tone={NL_TONE_MAP[tone]}
      label={label}
      value={value.toLocaleString()}
    />
  )
}

function StatusBadge({ row }: { row: NotificationRow }) {
  const t = useT()
  const Icon =
    row.status === 'sent'    ? Check
    : row.status === 'sending' ? Loader2
    : row.status === 'pending' ? Clock
    : row.status === 'failed'  ? RefreshCw
    : X
  const labelMap = {
    sent:    t.notifications.stats_sent,
    sending: t.notifications.stats_sending,
    pending: t.notifications.stats_pending,
    failed:  t.notifications.stats_failed,
    dead:    t.notifications.stats_dead,
  } as const
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[row.status]}`}>
      <Icon className={`h-3 w-3 ${row.status === 'sending' ? 'animate-spin' : ''}`} />
      {labelMap[row.status]}
    </span>
  )
}
