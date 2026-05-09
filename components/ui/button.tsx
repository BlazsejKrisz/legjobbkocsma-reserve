import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Refined Button.  Differences from the default shadcn baseline:
//   * Transitions cover bg + border + color + shadow on a single timing
//     so hover/active states feel coordinated, not piecemeal.
//   * Active-state press (translate-y-px) gives tactile feedback —
//     subtle but materially different from the default flat-press.
//   * Focus ring uses ring-2 with a soft ring/40 offset on background,
//     which reads as a real ring rather than an outline.
//   * Disabled keeps shadow off (otherwise it looks "active but inert").
//   * `success` and `soft` variants align with the new semantic tokens.
//
// React 19: ref is a regular prop now — `forwardRef` wrapper dropped.
// The function destructures `ref` from props if needed.  For Radix
// `Slot` (asChild=true), Slot itself forwards the ref correctly.
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-md text-sm font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
    "focus-visible:outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
    "active:translate-y-px",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm shadow-destructive/20 hover:bg-destructive/90",
        success:
          "bg-success text-success-foreground shadow-sm shadow-success/20 hover:bg-success/90",
        outline:
          "border border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground hover:border-foreground/20",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        soft:
          "bg-primary/10 text-primary hover:bg-primary/15",
        ghost:
          "hover:bg-accent hover:text-accent-foreground",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 text-sm [&_svg]:size-4",
        sm: "h-8 rounded-md px-3 text-[13px] [&_svg]:size-3.5",
        xs: "h-7 rounded-md px-2.5 text-xs [&_svg]:size-3.5",
        lg: "h-10 rounded-md px-5 text-sm [&_svg]:size-4",
        icon: "h-9 w-9 [&_svg]:size-4",
        "icon-sm": "h-8 w-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    ref?: React.Ref<HTMLButtonElement>
  }

function Button({
  className,
  variant,
  size,
  asChild = false,
  ref,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button"
  // Slot's ref is HTMLElement; native button's is HTMLButtonElement.
  // Cast through unknown to satisfy both branches without losing type
  // safety at the consumer end (the `ref` prop on ButtonProps is the
  // public API and is correctly typed as Ref<HTMLButtonElement>).
  return (
    <Comp
      ref={ref as unknown as React.Ref<HTMLButtonElement> & React.Ref<HTMLElement>}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
