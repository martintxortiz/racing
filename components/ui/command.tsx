import { Combobox } from "@base-ui/react/combobox";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Command(props: ComponentProps<typeof Combobox.Root>) {
  return <Combobox.Root filter={null} {...props} />;
}

function CommandInput({
  className,
  ...props
}: ComponentProps<typeof Combobox.Input>) {
  return (
    <Combobox.Input
      className={cn(
        "h-10 w-full rounded-[2px] bg-muted px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

function CommandList({
  className,
  ...props
}: ComponentProps<typeof Combobox.List>) {
  return <Combobox.List className={cn("p-1", className)} {...props} />;
}

function CommandItem({
  className,
  ...props
}: ComponentProps<typeof Combobox.Item>) {
  return (
    <Combobox.Item
      className={cn(
        "flex min-h-10 cursor-pointer flex-col justify-center rounded-[2px] px-3 py-1.5 text-sm outline-none data-highlighted:bg-primary/15 data-highlighted:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: ComponentProps<typeof Combobox.Empty>) {
  return (
    <Combobox.Empty
      className={cn(
        "px-3 py-6 text-center text-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Command, CommandEmpty, CommandInput, CommandItem, CommandList };
