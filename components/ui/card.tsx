import * as React from "react"

import { cn } from "@/lib/utils"

// Refined Card.  Differences from default shadcn:
//   * Drops the chunky `shadow` baseline — looked default-template-y.
//     Replaced with an inset 1px highlight on top + a 1px-translated
//     soft drop shadow.  Subtle depth, not pillowy.
//   * border opacity reduced to /80 so adjacent cards don't compete.
//   * rounded-xl preserved (matches the dialog rounding).
//   * CardHeader padding tightened to p-5 sm:p-6 to match dialog.
//   * CardTitle font-size dropped from default-leading to text-sm —
//     in dashboards, inline cards rarely want a giant heading.

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-border/80 bg-card text-card-foreground",
      // Top highlight + soft drop shadow.  In dark mode the top
      // highlight is barely-visible white; in light mode it's almost
      // invisible — both modes get a subtle "lifted" feel without the
      // shadcn-default chunky `shadow`.
      "shadow-[0_1px_0_hsl(0_0%_100%/0.03)_inset,0_1px_2px_-1px_rgba(0,0,0,0.08)]",
      className,
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1 p-5 sm:p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-sm font-semibold leading-none tracking-tight text-foreground",
      className,
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-[13px] leading-relaxed text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-5 pt-0 sm:p-6 sm:pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
}
