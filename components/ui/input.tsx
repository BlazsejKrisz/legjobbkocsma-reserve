import * as React from "react"

import { cn } from "@/lib/utils"

// Refined Input.  React 19: ref is a regular prop now — `forwardRef`
// wrapper dropped.  RHF's register() spreads `{ ref, ...rest }`
// directly so this is fully compatible.
type InputProps = React.ComponentProps<"input"> & {
  ref?: React.Ref<HTMLInputElement>
}

function Input({ className, type, ref, ...props }: InputProps) {
  const isNumeric = type === "number" || type === "tel"
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-input/60 bg-background px-3 py-1",
        "text-sm shadow-xs",
        "transition-[border-color,box-shadow,background-color] duration-150",
        "caret-primary",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-muted-foreground/70",
        "hover:border-input",
        "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:focus-visible:ring-destructive/40",
        isNumeric && "tabular-nums",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
