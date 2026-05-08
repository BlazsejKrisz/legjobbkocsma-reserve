import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { OverflowQueue } from '@/components/overflow/OverflowQueue'
import { Info } from 'lucide-react'
import { getServerT } from '@/lib/i18n/serverT'

export default async function OverflowPage() {
  const [session, t] = await Promise.all([getSession(), getServerT()])
  if (!session) redirect('/auth/login')
  if (session.isVenueStaff) redirect('/dashboard')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">{t.overflow_page.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.overflow_page.subtitle}
        </p>
      </div>

      {/* How-to callout */}
      <div className="flex gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
        <div className="text-xs text-blue-300/90 space-y-1">
          <p className="font-semibold text-blue-200">{t.overflow_page.how_to_title}</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-300/80">
            <li>{t.overflow_page.step_1_plain}</li>
            <li>{t.overflow_page.step_2_plain}</li>
            <li>{t.overflow_page.step_3_plain}</li>
            <li>{t.overflow_page.step_4_plain}</li>
          </ol>
          <p className="text-blue-300/60 pt-1">
            {t.overflow_page.help_text}
          </p>
        </div>
      </div>

      <OverflowQueue />
    </div>
  )
}
