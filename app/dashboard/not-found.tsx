import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Compass } from 'lucide-react'
import { getServerT } from '@/lib/i18n/serverT'

export default async function DashboardNotFound() {
  const t = await getServerT()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Compass className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{t.errors.not_found_title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {t.errors.not_found_description}
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard">{t.errors.back_to_dashboard}</Link>
      </Button>
    </div>
  )
}
