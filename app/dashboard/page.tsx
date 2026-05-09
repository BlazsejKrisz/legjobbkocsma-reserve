import { Suspense } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Building2,
  BarChart2,
  UserSquare2,
  Search,
} from 'lucide-react'
import { getSession } from '@/lib/auth/getSession'
import { OverviewStats } from '@/components/dashboard/OverviewStats'
import { TodayHourStrip } from '@/components/dashboard/TodayHourStrip'
import { UpcomingWeekStrip } from '@/components/dashboard/UpcomingWeekStrip'
import { RecentActivityFeed } from '@/components/dashboard/RecentActivityFeed'
import { redirect } from 'next/navigation'
import { getServerT } from '@/lib/i18n/serverT'

// Skeleton placeholder shapes — used for the per-component <Suspense>
// fallbacks so the layout doesn't pop in jarringly when data arrives.
function StatGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[124px] animate-pulse rounded-xl bg-muted/30" />
      ))}
    </div>
  )
}
function PanelSkeleton({ height = 'h-64' }: { height?: string }) {
  return <div className={`${height} animate-pulse rounded-xl bg-muted/30`} />
}

export default async function DashboardPage() {
  const [session, t] = await Promise.all([getSession(), getServerT()])
  if (!session) redirect('/auth/login')

  // venue_staff doesn't get a global dashboard — they're scoped to a single
  // venue.  Send them straight to their venue's timeline.
  if (session.isVenueStaff && session.venueIds[0]) {
    redirect(`/dashboard/venues/${session.venueIds[0]}`)
  }

  return (
    <div className="flex flex-col gap-7">
      {/* ─── Header ───────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t.dashboard.title}</h1>
        <p className="text-sm text-muted-foreground">{t.dashboard.subtitle}</p>
      </div>

      {/* ─── Stats grid ───────────────────────────────────────────────── */}
      <Suspense fallback={<StatGridSkeleton />}>
        <OverviewStats session={session} />
      </Suspense>

      {/* ─── Today's hour strip ───────────────────────────────────────── */}
      <Suspense fallback={<PanelSkeleton height="h-40" />}>
        <TodayHourStrip />
      </Suspense>

      {/* ─── Two-column: upcoming week + recent activity ──────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Suspense fallback={<PanelSkeleton />}>
          <UpcomingWeekStrip />
        </Suspense>
        <Suspense fallback={<PanelSkeleton />}>
          <RecentActivityFeed />
        </Suspense>
      </div>

      {/* ─── Quick links ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80">
          {t.dashboard.quick_links}
        </p>
        <div className="flex flex-wrap gap-2">
          <QuickLink
            href="/dashboard/reservations"
            icon={CalendarDays}
            label={t.dashboard.all_reservations}
          />
          {(session.isSuperAdmin || session.isSupport) && (
            <QuickLink
              href="/dashboard/availability"
              icon={Search}
              label={t.availability.action}
              tone="success"
            />
          )}
          {(session.isSuperAdmin || session.isSupport) && (
            <QuickLink
              href="/dashboard/overflow"
              icon={AlertTriangle}
              label={t.dashboard.manual_review_queue}
              tone="warning"
            />
          )}
          {(session.isSuperAdmin || session.isSupport) && (
            <QuickLink
              href="/dashboard/customers"
              icon={UserSquare2}
              label={t.dashboard.customer_profiles}
            />
          )}
          {(session.isSuperAdmin || session.isSupport) && (
            <QuickLink
              href="/dashboard/stats"
              icon={BarChart2}
              label={t.dashboard.statistics}
            />
          )}
          {session.isSuperAdmin && (
            <QuickLink
              href="/dashboard/venues"
              icon={Building2}
              label={t.dashboard.manage_venues}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// Refined quick-link chip.  Three tones: neutral default, success
// (availability check — proactive flow), warning (overflow — needs
// attention).  Using a small chip with a left-aligned icon, gap-2.5,
// and an arrow that nudges right on hover gives the dashboard tactile
// affordance without leaning on bright color blocks.
type QuickLinkProps = {
  href: string
  icon: React.ElementType
  label: string
  tone?: 'default' | 'success' | 'warning'
}
function QuickLink({ href, icon: Icon, label, tone = 'default' }: QuickLinkProps) {
  const styles =
    tone === 'success'
      ? 'border-success/25 bg-success/[0.06] text-success hover:border-success/40 hover:bg-success/10'
      : tone === 'warning'
      ? 'border-warning/30 bg-warning/[0.06] text-warning hover:border-warning/50 hover:bg-warning/10'
      : 'border-border/80 bg-card text-foreground hover:border-foreground/25 hover:bg-muted/50'

  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2.5 rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-colors ${styles}`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      {label}
      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
