import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { LogoutButton } from '@/components/logout-button'
import ThemeToggle from '@/components/theme-switcher'
import { SidebarContent } from './Sidebar'
import { MobileNav } from './MobileNav'
import { OverflowRealtimeSync } from './OverflowRealtimeSync'
import { LanguageSwitcher } from './LanguageSwitcher'
import { HelpButton } from './HelpButton'
import { WhatsNewButton } from './WhatsNewButton'
import { getSession } from '@/lib/auth/getSession'
import { createClient } from '@/lib/supabase/server'

async function getOverflowCount(): Promise<number> {
  try {
    const supabase = await createClient()
    const { count } = await supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_manual_review')
    return count ?? 0
  } catch {
    return 0
  }
}

export default async function DashboardShell({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session) {
    redirect('/auth/login')
  }

  const canSeeOverflow = session.isSuperAdmin || session.isSupport
  const overflowCount = canSeeOverflow ? await getOverflowCount() : 0
  const staffVenueId = session.venueIds?.[0]

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Realtime subscription — activates for roles that see the overflow queue */}
      {canSeeOverflow && <OverflowRealtimeSync />}

      {/* Sidebar – desktop only.  Below lg (1024px) we use the hamburger
          MobileNav so tablets and phones get full content width — important
          for the timeline grid and other wide views. */}
      <aside className="hidden w-[252px] shrink-0 border-r border-border/60 lg:flex lg:flex-col h-screen sticky top-0 overflow-y-auto scrollbar-thin">
        <SidebarContent role={session.role} initialOverflowCount={overflowCount} canSeeOverflow={canSeeOverflow} staffVenueId={staffVenueId} />
      </aside>

      {/* Main area.  min-w-0 + min-h-0 are needed because flex items default
          to min-width:auto, which would otherwise let wide children (e.g.
          the timeline grid) push the whole page wider than the viewport. */}
      <div className="flex flex-1 flex-col min-h-screen min-w-0">
        {/* Top bar — sticky, refined.  Backdrop blur + subtle border
            mimics the topbars in Linear / Vercel / Stripe.  Sits at
            48px to match the sidebar's brand-row height for a clean
            cross-page horizontal alignment. */}
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border/60 bg-background/80 backdrop-blur-md px-3 md:px-5">
          <div className="flex items-center gap-3 lg:hidden">
            <MobileNav role={session.role} initialOverflowCount={overflowCount} canSeeOverflow={canSeeOverflow} staffVenueId={staffVenueId} />
            <span className="text-[13px] font-semibold tracking-[-0.02em]">
              Legjobb<span className="text-primary">Kocsma</span>
            </span>
          </div>
          {/* Desktop left — sidebar has the brand, so we use this slot for
              the What's-new affordance.  Hidden for venue_staff since the
              changelog only lists super_admin / support tools. */}
          {(session.isSuperAdmin || session.isSupport) && (
            <>
              <div className="hidden lg:flex lg:items-center lg:gap-2">
                <WhatsNewButton />
              </div>
              {/* Mobile: surface the button between brand and right-side controls */}
              <div className="lg:hidden">
                <WhatsNewButton />
              </div>
            </>
          )}
          {/* Empty spacer so the right-side controls stay right-aligned for
              venue_staff who don't see the button. */}
          {!(session.isSuperAdmin || session.isSupport) && (
            <div className="hidden lg:block" />
          )}
          <div className="flex items-center gap-0.5">
            <HelpButton />
            <div className="mx-1.5 h-4 w-px bg-border/60" />
            <LanguageSwitcher />
            <div className="mx-1.5 h-4 w-px bg-border/60" />
            <ThemeToggle />
            <div className="mx-1.5 h-4 w-px bg-border/60" />
            <LogoutButton />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-3 py-5 sm:px-5 sm:py-6 md:px-8 md:py-8">
          <Suspense
            fallback={
              <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-pulse" />
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-pulse [animation-delay:120ms]" />
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-pulse [animation-delay:240ms]" />
              </div>
            }
          >
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  )
}
