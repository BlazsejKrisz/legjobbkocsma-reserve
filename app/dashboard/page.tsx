import { Suspense } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, CalendarDays, Building2, BarChart2, UserSquare2 } from 'lucide-react'
import { getSession } from '@/lib/auth/getSession'
import { OverviewStats } from '@/components/dashboard/OverviewStats'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')

  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Today's live snapshot — reservations, queue status, and 7-day completion rate
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
          Quick links
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/reservations"
            className="group flex items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <CalendarDays className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            All reservations
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>

          {(session.isSuperAdmin || session.isSupport) && (
            <Link
              href="/dashboard/overflow"
              className="group flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm font-medium text-amber-400 transition-colors hover:border-amber-500/40 hover:bg-amber-500/10"
            >
              <AlertTriangle className="h-4 w-4" />
              Manual review queue
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}

          {(session.isSuperAdmin || session.isSupport) && (
            <Link
              href="/dashboard/customers"
              className="group flex items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <UserSquare2 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              Customer profiles
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          )}

          {(session.isSuperAdmin || session.isSupport) && (
            <Link
              href="/dashboard/stats"
              className="group flex items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <BarChart2 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              Statistics
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          )}

          {session.isSuperAdmin && (
            <Link
              href="/dashboard/venues"
              className="group flex items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <Building2 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              Manage venues
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
