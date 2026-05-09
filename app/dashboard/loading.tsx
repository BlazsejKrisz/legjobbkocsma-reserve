import { Loader2 } from 'lucide-react'
import { getServerT } from '@/lib/i18n/serverT'

// Segment-level fallback for streaming.  Because every dashboard page is
// an async RSC, this fallback is what the user sees during the initial
// render window.  We keep it intentionally restrained — a single inline
// indicator beats a full skeleton tree that flashes for 200ms.
export default async function DashboardLoading() {
  const t = await getServerT()
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {t.common.loading}
    </div>
  )
}
