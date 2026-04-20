import { createClient } from '@/lib/supabase/server'
import { CalendarDays, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react'
import { subDays, format } from 'date-fns'
import type { UserSession } from '@/lib/auth/getSession'

type StatCardProps = {
  title: string
  value: string | number
  sub?: string
  icon: React.ElementType
  variant?: 'default' | 'brand' | 'success' | 'warning'
}

const VARIANT_STYLES = {
  default: {
    card: 'bg-card border-border/60',
    icon: 'bg-secondary text-muted-foreground',
    value: 'text-foreground',
    sub: 'text-muted-foreground',
  },
  brand: {
    card: 'bg-primary/10 border-primary/20',
    icon: 'bg-primary/15 text-primary',
    value: 'text-primary',
    sub: 'text-primary/60',
  },
  success: {
    card: 'bg-emerald-500/6 border-emerald-500/20',
    icon: 'bg-emerald-500/12 text-emerald-400',
    value: 'text-emerald-400',
    sub: 'text-emerald-400/60',
  },
  warning: {
    card: 'bg-amber-500/6 border-amber-500/20',
    icon: 'bg-amber-500/12 text-amber-400',
    value: 'text-amber-400',
    sub: 'text-amber-400/60',
  },
}

function StatCard({ title, value, sub, icon: Icon, variant = 'default' }: StatCardProps) {
  const s = VARIANT_STYLES[variant]
  return (
    <div className={`rounded-xl border p-5 ${s.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className={`text-3xl font-bold tabular-nums tracking-tight ${s.value}`}>{value}</p>
          {sub && <p className={`text-[11px] ${s.sub}`}>{sub}</p>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${s.icon}`}>
          <Icon className="h-4.5 w-4.5" style={{ width: '18px', height: '18px' }} />
        </div>
      </div>
    </div>
  )
}

export async function OverviewStats(props: { session: UserSession }) {
  void props
  const supabase = await createClient()

  const today = new Date()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const from7 = format(subDays(today, 6), 'yyyy-MM-dd')
  const to7   = format(today, 'yyyy-MM-dd')

  const [todayResult, overflowResult, confirmedResult, statsResult] = await Promise.all([
    supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .gte('starts_at', todayStart.toISOString())
      .lte('starts_at', todayEnd.toISOString()),
    supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_manual_review'),
    supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .gte('starts_at', todayStart.toISOString()),
    supabase.rpc('get_reservation_stats', { p_from: from7, p_to: to7 }),
  ])

  const todayCount     = todayResult.count     ?? 0
  const overflowCount  = overflowResult.count  ?? 0
  const confirmedToday = confirmedResult.count  ?? 0

  const rows7 = statsResult.data ?? []
  const total7    = rows7.reduce((s: number, r: { total: number }) => s + r.total, 0)
  const completed7 = rows7.reduce((s: number, r: { completed: number }) => s + r.completed, 0)
  const overflow7  = rows7.reduce((s: number, r: { overflow: number }) => s + r.overflow, 0)
  const completionRate7 = total7 > 0
    ? Math.round((completed7 / (total7 - overflow7)) * 100)
    : null

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard
        title="Today's reservations"
        value={todayCount}
        sub="Scheduled for today"
        icon={CalendarDays}
        variant="brand"
      />
      <StatCard
        title="Confirmed today"
        value={confirmedToday}
        sub="Ready to go"
        icon={CheckCircle}
        variant="success"
      />
      <StatCard
        title="Manual review queue"
        value={overflowCount}
        sub={overflowCount > 0 ? 'Needs attention' : 'Queue clear'}
        icon={AlertTriangle}
        variant={overflowCount > 0 ? 'warning' : 'default'}
      />
      <StatCard
        title="Completion rate"
        value={completionRate7 != null ? `${completionRate7}%` : '—'}
        sub="Last 7 days"
        icon={TrendingUp}
        variant={completionRate7 != null && completionRate7 >= 70 ? 'success' : 'default'}
      />
    </div>
  )
}
