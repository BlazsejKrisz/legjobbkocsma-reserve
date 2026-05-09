import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

// Single stat-card primitive used everywhere a dashboard shows a key
// number: the overview, the stats page summary cards, the notifications
// dashboard, embed analytics, etc.  Previously 4 different ad-hoc
// implementations had subtly different padding/typography/tone classes;
// consolidating to this one lets a single token swap re-theme them.
//
// Variants:
//   tone     — semantic CSS-token tinted card (default/brand/success/...)
//   layout   — `default` (label on top, value below) or `compact` (tight
//              row layout for sidebar-y use cases like the notifications
//              dashboard's quick-stats strip)
//
// Optional features:
//   comparison — { previous: number; label: string }: shows ↑/↓/— delta
//                next to the value (handy for "today vs yesterday").
//   icon       — small react node aligned right of the label.
//   href       — wraps the whole card in a link with hover affordance.
//   hint       — sub-line under the value.

const cardStyles = cva('relative rounded-xl border bg-card transition-colors', {
  variants: {
    tone: {
      default: 'border-border/80',
      brand: 'border-primary/25 bg-primary/[0.05]',
      success: 'border-success/25 bg-success/[0.05]',
      warning: 'border-warning/30 bg-warning/[0.05]',
      info: 'border-info/25 bg-info/[0.05]',
      destructive: 'border-destructive/25 bg-destructive/[0.05]',
    },
    layout: {
      default: 'flex flex-col gap-3 p-5',
      compact: 'flex flex-col gap-1 p-3',
    },
  },
  defaultVariants: { tone: 'default', layout: 'default' },
})

const dotStyles = cva('h-1.5 w-1.5 rounded-full ring-[3px]', {
  variants: {
    tone: {
      default: 'bg-muted-foreground/50 ring-muted-foreground/15',
      brand: 'bg-primary ring-primary/15',
      success: 'bg-success ring-success/15',
      warning: 'bg-warning ring-warning/15',
      info: 'bg-info ring-info/15',
      destructive: 'bg-destructive ring-destructive/15',
    },
  },
  defaultVariants: { tone: 'default' },
})

type Tone = NonNullable<VariantProps<typeof cardStyles>['tone']>
type Layout = NonNullable<VariantProps<typeof cardStyles>['layout']>

type Props = {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  className?: string
  href?: string
  tone?: Tone
  layout?: Layout
  // Compact mode hides the dot indicator and tightens line-heights.
  // Set explicitly via `layout="compact"`.
  comparison?: {
    previous: number
    label: string
  }
}

function trendDirection(current: number, previous: number) {
  if (current > previous) return 'up' as const
  if (current < previous) return 'down' as const
  return 'flat' as const
}

export function StatCard({
  tone = 'default',
  layout = 'default',
  label,
  value,
  hint,
  icon,
  className,
  href,
  comparison,
}: Props) {
  // Trend computation: only renders when `comparison` is provided AND
  // the value is numeric.  Strings (like "87%") skip trend display.
  let trend: 'up' | 'down' | 'flat' | null = null
  let delta = 0
  if (comparison && typeof value === 'number') {
    trend = trendDirection(value, comparison.previous)
    delta = value - comparison.previous
  }
  const TrendIcon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus

  const isCompact = layout === 'compact'

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={cn(
          'flex items-center font-semibold uppercase tracking-[0.08em] text-muted-foreground',
          isCompact ? 'gap-1.5 text-[10px]' : 'gap-2 text-[11px]',
        )}>
          {!isCompact && <span className={dotStyles({ tone })} aria-hidden />}
          {label}
        </span>
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      </div>

      <div className={cn(
        'flex items-end justify-between gap-3',
        isCompact && 'flex-row items-baseline',
      )}>
        <span className={cn(
          'tabular-nums tracking-tight text-foreground font-semibold',
          isCompact ? 'text-lg' : 'text-3xl',
        )}>
          {value}
        </span>

        {trend && comparison && (
          <div className={cn(
            'flex items-center gap-1.5',
            isCompact ? '' : 'pb-1',
          )}>
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                trend === 'up' && 'bg-success/15 text-success',
                trend === 'down' && 'bg-destructive/15 text-destructive',
                trend === 'flat' && 'bg-muted text-muted-foreground',
              )}
            >
              <TrendIcon className="h-3 w-3" strokeWidth={2.5} />
              {delta > 0 ? `+${delta}` : delta}
            </span>
            {!isCompact && (
              <span className="text-[11px] text-muted-foreground">
                {comparison.label}
              </span>
            )}
          </div>
        )}
      </div>

      {hint && (
        <span className={cn(
          'text-muted-foreground',
          isCompact ? 'text-[11px]' : 'text-[12px]',
        )}>
          {hint}
        </span>
      )}
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        className={cn(cardStyles({ tone, layout }), 'hover:bg-muted/50', className)}
      >
        {inner}
      </a>
    )
  }
  return <div className={cn(cardStyles({ tone, layout }), className)}>{inner}</div>
}
