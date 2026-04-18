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

type SourceRow = {
  source: string
  total: number
}

type VenueRow = {
  venue_id: number
  venue_name: string
  total: number
  confirmed: number
  cancelled: number
  guests: number
}

type Props = {
  daily: DailyRow[]
  sources: SourceRow[]
  venues: VenueRow[]
  completionRate: number
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6']

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-foreground">{children}</h2>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function CompletionGauge({ rate }: { rate: number }) {
  const clamped = Math.min(100, Math.max(0, rate))
  const color = clamped >= 70 ? '#10b981' : clamped >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-4">
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
      <p className="text-xs text-muted-foreground">Completion rate · last 30 days</p>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
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

export function StatsCharts({ daily, sources, venues, completionRate }: Props) {
  const dailyFormatted = daily.map((d) => ({
    ...d,
    label: format(parseISO(d.day), 'MMM d'),
  }))

  const sourceFormatted = sources.map((s) => ({
    name: s.source || 'unknown',
    value: s.total,
  }))

  return (
    <div className="flex flex-col gap-6">
      {/* Completion rate + source breakdown */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ChartCard title="Completion rate">
          <CompletionGauge rate={completionRate} />
        </ChartCard>

        <ChartCard title="Reservations by source">
          {sourceFormatted.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No data</p>
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
                  label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                  labelLine={false}
                >
                  {sourceFormatted.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [v, 'reservations']} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Daily bar chart */}
      <ChartCard title="Daily reservations (last 30 days)">
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
            <Bar dataKey="total" name="Total" fill="#6366f1" radius={[2, 2, 0, 0]} />
            <Bar dataKey="confirmed" name="Confirmed" fill="#10b981" radius={[2, 2, 0, 0]} />
            <Bar dataKey="cancelled" name="Cancelled" fill="#ef4444" radius={[2, 2, 0, 0]} />
            <Bar dataKey="overflow" name="Overflow" fill="#f59e0b" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Guest count chart */}
      <ChartCard title="Daily guest count (last 30 days)">
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
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="total_guests" name="Guests" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Venue breakdown */}
      {venues.length > 0 && (
        <ChartCard title="Reservations by venue">
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
              <Bar dataKey="total" name="Total" fill="#6366f1" radius={[0, 2, 2, 0]} />
              <Bar dataKey="confirmed" name="Confirmed" fill="#10b981" radius={[0, 2, 2, 0]} />
              <Bar dataKey="guests" name="Guests" fill="#8b5cf6" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  )
}
