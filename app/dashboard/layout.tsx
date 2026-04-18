import { Suspense } from 'react'
import DashboardShell from '@/components/layout/DashboardShell'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  )
}
