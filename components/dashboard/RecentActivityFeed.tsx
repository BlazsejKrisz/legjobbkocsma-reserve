import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getServerT } from '@/lib/i18n/serverT'
import { formatDistanceToNowStrict } from 'date-fns'
import { hu, enUS } from 'date-fns/locale'
import { cookies } from 'next/headers'
import { cn } from '@/lib/utils'
import { Plus, Check, X, Pencil, ArrowRight, Activity } from 'lucide-react'

// Recent activity feed: last 8 reservations (newest first), with a tiny
// icon indicating their status.  Each row links to the reservation
// detail.  Replaces the "you have nothing here" empty feel with real
// scrolling content as soon as one booking exists.
//
// Why reservations and not reservation_events?
//   * The `reservation_events` table lives behind RLS and would need
//     a join to a venue we know the user can read.  reservations
//     itself has the same RLS scoping and is simpler to query.
//   * The "what just happened" intent is satisfied by "newest 8
//     reservations" with their current status.

const STATUS_TONE = {
  confirmed: 'success',
  pending_manual_review: 'warning',
  cancelled: 'destructive',
  completed: 'info',
  no_show: 'destructive',
} as const

const STATUS_ICON = {
  confirmed: Check,
  pending_manual_review: Pencil,
  cancelled: X,
  completed: Check,
  no_show: X,
} as const

export async function RecentActivityFeed() {
  const [supabase, t, store] = await Promise.all([
    createClient(),
    getServerT(),
    cookies(),
  ])
  const lang = store.get('lang')?.value === 'hu' ? 'hu' : 'en'
  const locale = lang === 'hu' ? hu : enUS

  const { data } = await supabase
    .from('reservations')
    .select(`
      id, starts_at, party_size, status, created_at,
      customers (full_name),
      requested_venue:requested_venue_id (id, name)
    `)
    .order('created_at', { ascending: false })
    .limit(8)

  const items = data ?? []

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-5 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t.overview.recent_activity_title}
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t.overview.recent_activity_subtitle}
          </p>
        </div>
        <Link
          href="/dashboard/reservations"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {t.overview.see_all}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-3 py-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/60 ring-1 ring-inset ring-border/60">
            <Activity className="h-4 w-4 text-muted-foreground/70" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{t.overview.recent_activity_empty}</p>
            <p className="text-[13px] text-muted-foreground">{t.overview.recent_activity_empty_hint}</p>
          </div>
        </div>
      ) : (
        <ol className="-mx-2">
          {items.map((r) => {
            const status = r.status as keyof typeof STATUS_TONE
            const tone = STATUS_TONE[status] ?? 'default'
            const Icon = STATUS_ICON[status] ?? Plus
            const customer = r.customers as unknown as { full_name: string | null } | null
            const venue = r.requested_venue as unknown as { id: number; name: string } | null
            const ago = formatDistanceToNowStrict(new Date(r.created_at), {
              addSuffix: true,
              locale,
            })

            return (
              <li key={r.id} className="group">
                <Link
                  href={`/dashboard/reservations?selected=${r.id}`}
                  className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/40 transition-colors"
                >
                  <div
                    className={cn(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ring-inset',
                      tone === 'success' && 'bg-success/15 ring-success/25 text-success',
                      tone === 'warning' && 'bg-warning/15 ring-warning/25 text-warning',
                      tone === 'destructive' && 'bg-destructive/15 ring-destructive/25 text-destructive',
                      tone === 'info' && 'bg-info/15 ring-info/25 text-info',
                    )}
                  >
                    <Icon className="h-3 w-3" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-foreground leading-snug">
                      <span className="font-medium">{customer?.full_name ?? t.common.walk_in}</span>
                      {' · '}
                      <span className="tabular-nums">{r.party_size}</span>{' '}
                      <span className="text-muted-foreground">{t.overview.guests_label}</span>
                      {venue && (
                        <>
                          {' · '}
                          <span className="text-muted-foreground">{venue.name}</span>
                        </>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {ago}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
