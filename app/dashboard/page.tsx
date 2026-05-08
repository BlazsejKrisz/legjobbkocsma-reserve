import { Suspense } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, CalendarDays, Building2, BarChart2, UserSquare2, Search } from 'lucide-react'
import { getSession } from '@/lib/auth/getSession'
import { OverviewStats } from '@/components/dashboard/OverviewStats'
import { redirect } from 'next/navigation'
import { getServerT } from '@/lib/i18n/serverT'

export default async function DashboardPage() {
  const [session, t] = await Promise.all([getSession(), getServerT()])
  if (!session) redirect('/auth/login')

  // venue_staff doesn't get a global dashboard — they're scoped to a single
  // venue.  Send them straight to their venue's timeline.
  if (session.isVenueStaff && session.venueIds[0]) {
    redirect(`/dashboard/venues/${session.venueIds[0]}`)
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.dashboard.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.dashboard.subtitle}
        </p>
      </div>

      {/* Stats */}
      <Suspense
        fallback={
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/30" />
            ))}
          </div>
        }
      >
        <OverviewStats session={session} />
      </Suspense>

      {/* Quick actions */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t.dashboard.quick_links}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/reservations"
            className="group flex items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <CalendarDays className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            {t.dashboard.all_reservations}
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>

          {(session.isSuperAdmin || session.isSupport) && (
            <Link
              href="/dashboard/availability"
              className="group flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm font-medium text-emerald-400 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10"
            >
              <Search className="h-4 w-4" />
              {t.availability.action}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}

          {(session.isSuperAdmin || session.isSupport) && (
            <Link
              href="/dashboard/overflow"
              className="group flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm font-medium text-amber-400 transition-colors hover:border-amber-500/40 hover:bg-amber-500/10"
            >
              <AlertTriangle className="h-4 w-4" />
              {t.dashboard.manual_review_queue}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}

          {(session.isSuperAdmin || session.isSupport) && (
            <Link
              href="/dashboard/customers"
              className="group flex items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <UserSquare2 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              {t.dashboard.customer_profiles}
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          )}

          {(session.isSuperAdmin || session.isSupport) && (
            <Link
              href="/dashboard/stats"
              className="group flex items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <BarChart2 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              {t.dashboard.statistics}
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          )}

          {session.isSuperAdmin && (
            <Link
              href="/dashboard/venues"
              className="group flex items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <Building2 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              {t.dashboard.manage_venues}
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
