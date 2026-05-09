import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Refined Badge.  Two distinct usage modes via the `tone` of `variant`
// and the `kind` prop:
//
//   * `kind="metadata"` (default) — small uppercase tracking-letter chips
//     for table-cell tags, status, etc.  Linear/Vercel signature look.
//   * `kind="callout"` — readable mixed-case tag for inline callouts
//     ("Most beférne", "Új"), where the metadata-style is too tiny.
//
// Sizes bumped one notch from the previous round so desktop legibility
// stops being a complaint:
//
//                                      old      new
//   default kind=metadata    text   →  10px →   11px
//   sm                                  9px →  10px
//   lg                                 11px →  12px
//   default kind=callout                12px (new tier)
//   lg      kind=callout                13px (new tier)

const badgeVariants = cva(
  cn(
    "inline-flex items-center gap-1 rounded-md border",
    "tabular-nums transition-colors duration-150",
    "focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-1 focus:ring-offset-background",
  ),
  {
    variants: {
      variant: {
        default:
          "border-primary/25 bg-primary/10 text-primary",
        solid:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-border/60 bg-secondary text-secondary-foreground",
        outline:
          "border-border/80 bg-transparent text-foreground",
        muted:
          "border-border/60 bg-muted text-muted-foreground",
        success:
          "border-success/30 bg-success/10 text-success",
        warning:
          "border-warning/30 bg-warning/10 text-warning",
        info:
          "border-info/30 bg-info/10 text-info",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive",
      },
      kind: {
        // Metadata: small caps, tight letter-spacing, signals "this is
        // a tag/chip" to scanning eyes.
        metadata: "font-semibold uppercase tracking-[0.06em]",
        // Callout: mixed case at a comfortable reading size.  For
        // inline UI hints the user actually reads.
        callout: "font-medium tracking-tight",
      },
      size: {
        default: "px-2 py-0.5",
        sm: "px-1.5 py-0",
        lg: "px-2.5 py-0.5",
      },
    },
    compoundVariants: [
      // Metadata text scales
      { kind: "metadata", size: "default", className: "text-[11px]" },
      { kind: "metadata", size: "sm", className: "text-[10px]" },
      { kind: "metadata", size: "lg", className: "text-[12px]" },
      // Callout text scales — bigger, readable, no uppercase
      { kind: "callout", size: "default", className: "text-xs" },
      { kind: "callout", size: "sm", className: "text-[11px]" },
      { kind: "callout", size: "lg", className: "text-[13px]" },
    ],
    defaultVariants: {
      variant: "default",
      kind: "metadata",
      size: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, kind, size, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, kind, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
