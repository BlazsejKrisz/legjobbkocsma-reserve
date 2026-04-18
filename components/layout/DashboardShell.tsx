import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { LogoutButton } from '@/components/logout-button'
import ThemeToggle from '@/components/theme-switcher'
import { SidebarContent } from './Sidebar'
import { MobileNav } from './MobileNav'
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

  const overflowCount = await getOverflowCount()

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar – desktop */}
      <aside className="hidden w-60 shrink-0 border-r border-border/60 md:flex md:flex-col">
        <SidebarContent role={session.role} overflowCount={overflowCount} />
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-13 items-center justify-between border-b border-border/60 bg-background px-4 md:px-6" style={{ height: '52px' }}>
          <div className="flex items-center gap-3 md:hidden">
            <MobileNav role={session.role} overflowCount={overflowCount} />
            <span className="text-sm font-semibold">
              Reserve<span className="text-primary">Ops</span>
            </span>
          </div>
          {/* Desktop left — intentionally empty; sidebar has the brand */}
          <div className="hidden md:block" />
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <div className="mx-1 h-4 w-px bg-border" />
            <LogoutButton />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <Suspense
            fallback={
              <div className="flex h-32 items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading…</p>
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
