'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { useT } from '@/lib/i18n/useT'

// Per Next.js convention, error.tsx renders when a route segment throws.
// Without it the user sees Next's bare default; here they get a styled
// surface and a "try again" reset.  Strings come from the translation
// layer so HU users don't suddenly see English on errors.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useT()

  useEffect(() => {
    // Surface to the server logs without leaking a stack trace into the UI.
    // The digest is safe to render — it correlates to the server-side log.
    console.error('[dashboard/error]', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{t.errors.generic_title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {t.errors.generic_description}
        </p>
        {error.digest && (
          <p className="font-mono text-[11px] text-muted-foreground/80">
            {t.errors.ref_label} {error.digest}
          </p>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        {t.errors.try_again}
      </Button>
    </div>
  )
}
