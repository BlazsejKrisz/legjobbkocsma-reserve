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
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t.overflow_page.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.overflow_page.subtitle}
        </p>
      </div>

      {/* How-to callout — refined: brand-info tone instead of raw blue,
          slight inset shadow for "lifted" feel, larger icon disc so it
          reads as a design element rather than an inline emoji. */}
      <div className="flex gap-3.5 rounded-lg border border-info/25 bg-info/[0.06] px-4 py-3.5 shadow-[inset_0_1px_0_hsl(var(--info)/0.08)]">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-info/15 ring-1 ring-inset ring-info/25">
          <Info className="h-4 w-4 text-info" strokeWidth={2} />
        </div>
        <div className="text-[13px] leading-relaxed space-y-1.5 text-info/95">
          <p className="text-sm font-semibold tracking-tight text-foreground">{t.overflow_page.how_to_title}</p>
          <ol className="list-decimal list-outside space-y-1 pl-4 text-muted-foreground">
            <li>{t.overflow_page.step_1_plain}</li>
            <li>{t.overflow_page.step_2_plain}</li>
            <li>{t.overflow_page.step_3_plain}</li>
            <li>{t.overflow_page.step_4_plain}</li>
          </ol>
          <p className="text-muted-foreground/80 pt-1">
            {t.overflow_page.help_text}
          </p>
        </div>
      </div>

      <OverflowQueue />
    </div>
  )
}
