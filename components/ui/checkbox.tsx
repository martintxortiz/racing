import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Checkbox({
  className,
  indeterminate = false,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "group flex size-6 shrink-0 items-center justify-center rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      indeterminate={indeterminate}
      {...props}
    >
      <span className="flex size-4 items-center justify-center rounded-[2px] border border-foreground/60 bg-background group-data-[checked]:border-brand group-data-[checked]:bg-brand group-data-[indeterminate]:border-brand group-data-[indeterminate]:bg-brand">
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white">
          {indeterminate ? (
            <span className="h-0.5 w-2 bg-current" />
          ) : (
            <span className="size-2 rotate-[-45deg] border-b-2 border-l-2 border-current" />
          )}
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
