'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { Inbox } from 'lucide-react'
import { useT } from '@/lib/i18n/useT'

type DailyRow = {
  day: string
  total: number
  confirmed: number
  cancelled: number
  no_show: number
  completed: number
  overflow: number
  total_guests: number
}

type SourceRow = { source: string; total: number }
type VenueRow = {
  venue_id: number
  venue_name: string
  total: number
  confirmed: number
  cancelled: number
  guests: number
}
type DowRow = { dow: number; total: number; guests: number }
type HodRow = { hour: number; total: number; guests: number }
type LeadRow = { bucket: string; total: number }

type Props = {
  daily: DailyRow[]
  sources: SourceRow[]
  venues: VenueRow[]
  dow: DowRow[]
  hod: HodRow[]
  leadTime: LeadRow[]
  completionRate: number
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6']

// ─── Building blocks ───────────────────────────────────────────────────────────

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Inbox className="h-7 w-7 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

function CompletionGauge({ rate, subtitle }: { rate: number; subtitle: string }) {
  const clamped = Math.min(100, Math.max(0, rate))
  const color = clamped >= 70 ? '#10b981' : clamped >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-3">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="12" className="text-muted/30" />
          <circle
            cx="50" cy="50" r="40"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeDasharray={`${(clamped / 100) * 251.2} 251.2`}
            strokeLinecap="round"
          />
        </svg>
        <span className="text-2xl font-bold tabular-nums" style={{ color }}>{clamped}%</span>
      </div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  )
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md text-xs">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StatsCharts({ daily, sources, venues, dow, hod, leadTime, completionRate }: Props) {
  const t = useT()

  const dailyFormatted = daily.map((d) => ({
    ...d,
    label: format(parseISO(d.day), 'MMM d'),
  }))

  const sourceFormatted = sources.map((s) => ({
    name: s.source || 'unknown',
    value: s.total,
  }))

  // Day-of-week labels — order Mon→Sun is more intuitive than Sun→Sat for HU/EN
  const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]
  const dowMap = new Map(dow.map((r) => [r.dow, r]))
  const dowFormatted = DOW_ORDER.map((d) => ({
    label: t.stats_charts.dow[d as 0|1|2|3|4|5|6],
    total: dowMap.get(d)?.total ?? 0,
    guests: dowMap.get(d)?.guests ?? 0,
  }))

  const hodFormatted = hod.map((h) => ({
    hour: h.hour,
    label: `${String(h.hour).padStart(2, '0')}:00`,
    total: h.total,
    guests: h.guests,
  }))

  const leadLabels: Record<string, string> = {
    same_day:  t.stats_charts.lead_same_day,
    '1_2_days': t.stats_charts.lead_1_2_days,
    '3_7_days': t.stats_charts.lead_3_7_days,
    '1_2_weeks': t.stats_charts.lead_1_2_weeks,
    over_2w:   t.stats_charts.lead_over_2w,
  }
  const leadFormatted = leadTime.map((l) => ({
    name: leadLabels[l.bucket] ?? l.bucket,
    value: l.total,
  }))

  const totalReservations = daily.reduce((s, d) => s + d.total, 0)
  const hasAnyData = totalReservations > 0
  const totalLead = leadFormatted.reduce((s, l) => s + l.value, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* ─── Top row: completion + source ───────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ChartCard title={t.stats_charts.completion_rate}>
          {hasAnyData ? (
            <CompletionGauge rate={completionRate} subtitle={t.stats_charts.completion_rate_subtitle} />
          ) : (
            <EmptyChart message={t.stats_charts.no_data_hint} />
          )}
        </ChartCard>

        <ChartCard title={t.stats_charts.by_source}>
          {sourceFormatted.length === 0 ? (
            <EmptyChart message={t.stats_charts.no_data_hint} />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={sourceFormatted}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                  labelLine={false}
                >
                  {sourceFormatted.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value ?? 0, t.stats_charts.reservations_label]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={t.stats_charts.lead_time} subtitle={t.stats_charts.lead_time_subtitle}>
          {totalLead === 0 ? (
            <EmptyChart message={t.stats_charts.no_data_hint} />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={leadFormatted} layout="vertical" barSize={14}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name={t.stats_charts.reservations_label} fill="#8b5cf6" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ─── Pattern row: day-of-week + hour-of-day ─────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title={t.stats_charts.by_dow} subtitle={t.stats_charts.by_dow_subtitle}>
          {!hasAnyData ? (
            <EmptyChart message={t.stats_charts.no_data_hint} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dowFormatted} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name={t.stats_charts.reservations_label} fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="guests" name={t.stats_charts.guests} fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={t.stats_charts.by_hod} subtitle={t.stats_charts.by_hod_subtitle}>
          {!hasAnyData ? (
            <EmptyChart message={t.stats_charts.no_data_hint} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hodFormatted} barSize={10}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  interval={1}
                />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name={t.stats_charts.reservations_label} fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ─── Time series ─────────────────────────────────────────────────── */}
      <ChartCard title={t.stats_charts.daily_reservations}>
        {!hasAnyData ? (
          <EmptyChart message={t.stats_charts.no_data_hint} />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dailyFormatted} barSize={8} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="total" name={t.stats_charts.total} fill="#6366f1" radius={[2, 2, 0, 0]} />
              <Bar dataKey="confirmed" name={t.stats_charts.confirmed} fill="#10b981" radius={[2, 2, 0, 0]} />
              <Bar dataKey="cancelled" name={t.stats_charts.cancelled} fill="#ef4444" radius={[2, 2, 0, 0]} />
              <Bar dataKey="overflow" name={t.stats_charts.overflow} fill="#f59e0b" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title={t.stats_charts.daily_guests}>
        {!hasAnyData ? (
          <EmptyChart message={t.stats_charts.no_data_hint} />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyFormatted} barSize={10}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total_guests" name={t.stats_charts.guests} fill="#8b5cf6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {venues.length > 0 && (
        <ChartCard title={t.stats_charts.by_venue}>
          <ResponsiveContainer width="100%" height={Math.max(180, venues.length * 50)}>
            <BarChart data={venues} layout="vertical" barSize={14} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="venue_name"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={110}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="total" name={t.stats_charts.total} fill="#6366f1" radius={[0, 2, 2, 0]} />
              <Bar dataKey="confirmed" name={t.stats_charts.confirmed} fill="#10b981" radius={[0, 2, 2, 0]} />
              <Bar dataKey="guests" name={t.stats_charts.guests} fill="#8b5cf6" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  )
}
