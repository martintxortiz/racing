import { Input as InputPrimitive } from "@base-ui/react/input";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const inputVariants = cva(
  "rounded-[2px] font-medium placeholder:text-muted-foreground transition-all duration-100",
  {
    variants: {
      variant: {
        default: "bg-muted hover:bg-accent",
        card: "bg-foreground/10 hover:bg-foreground/15",
      },
      size: {
        sm: "h-7 px-2 text-xs",
        default: "h-9 px-2.5 text-sm",
        lg: "h-9 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Input({
  className,
  variant,
  size,
  ...props
}: Omit<InputPrimitive.Props, "size"> & VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(inputVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Input };
