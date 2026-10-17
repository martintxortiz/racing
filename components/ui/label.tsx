import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-sm font-medium text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Label }
export type LabelProps = ComponentProps<"label">
