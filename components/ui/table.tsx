"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Refined Table.  Differences from default shadcn:
//   * Header cells use a tinted `bg-muted/40` so the header reads as a
//     distinct band — rather than blending into the body.  Refined
//     SaaS tables (Linear, Vercel, Stripe) all do something similar.
//   * Header text-[10px] uppercase tracking — a small typographic
//     differentiator that signals "this is metadata" to scanning eyes.
//   * Row hover is `bg-muted/30` (was /50) — subtler, less noisy when
//     scanning.  Plus a left-edge accent appears on hover for the
//     active row.
//   * tabular-nums on the entire body so any digit-bearing column
//     stays in a perfect grid — kills the "wobbly numbers" tell.
//   * Cell padding tightened to px-3 py-2 (was p-2) — gives breathing
//     room without bloating row height.
//   * Last-row no border, plus rounded clipping at the container
//     level (Caller wraps with `rounded-md border overflow-hidden`).

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto scrollbar-thin"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm tabular-nums", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-muted/40 [&_tr]:border-b [&_tr]:border-border/80", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/30 border-t border-border/80 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border/60",
        "transition-colors duration-100",
        "hover:bg-muted/30",
        "data-[state=selected]:bg-muted/60",
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // Bumped from h-9 to h-10 + text-[10px] to text-[11px] for
        // desktop legibility — small caps stays as the typographic
        // signal but is no longer eye-strain.
        "h-10 px-3.5 text-left align-middle whitespace-nowrap",
        "text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        // Bumped from text-[13px] to text-sm.  Cell padding 3.5/2.5
        // gives a slightly taller row that reads as deliberate
        // breathing room rather than cramped data.
        "px-3.5 py-3 align-middle whitespace-nowrap text-sm text-foreground",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-[13px] text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
