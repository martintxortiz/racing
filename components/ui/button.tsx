import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[2px] font-medium whitespace-nowrap cursor-pointer transition-all duration-100 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white/90 hover:bg-[#2a74fe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
        secondary: "bg-muted-foreground/25 hover:bg-muted-foreground/35 text-white/90",
        link: "h-auto min-h-6 rounded-none bg-transparent px-0 text-white underline-offset-4 hover:bg-transparent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
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
  variant = "primary",
  size,
  loading,
  children,
  disabled,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  const isPrimary = !variant || variant === "primary"

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size }),
        (disabled || loading) && "cursor-not-allowed",
        loading && isPrimary && "bg-[#0b4ecb] hover:bg-[#0b4ecb]",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size={16} /> : children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
export type { ButtonProps } from "@base-ui/react/button"
