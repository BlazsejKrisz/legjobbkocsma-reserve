import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

// Page-level header used across every dashboard page.  The previous
// implementation duplicated the same `<div><h1><p>` JSX in 15+ places
// with subtle drift (`text-base` vs `text-lg`, different spacing).
// Centralizing here keeps all pages on one rhythm.
//
// The optional eyebrow gives important pages a small uppercase tag
// above the title — a tasteful detail that pulls the dashboard
// further from "default shadcn template" territory.

type Props = {
  title: string
  subtitle?: string
  eyebrow?: string
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  backHref,
  backLabel,
  actions,
  className,
}: Props) {
  return (
    <header
      className={cn(
        'flex flex-col gap-2 pb-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className="space-y-1.5 min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel ?? 'Back'}
          </Link>
        )}
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {subtitle && (
          <p className="text-[13px] sm:text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  )
}
