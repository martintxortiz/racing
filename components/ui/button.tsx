import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[2px] font-medium whitespace-nowrap cursor-pointer transition-all duration-100",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white/90 hover:bg-[#2a74fe]",
        secondary: "bg-muted hover:bg-muted-foreground/25 text-white/90",
      },
      size: {
        sm: "h-7 px-2 text-xs",
        default: "h-9 px-2.5 text-sm",
        lg: "h-9 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants }
export type { ButtonProps } from "@base-ui/react/button"
