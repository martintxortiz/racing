import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuSubmenu = MenuPrimitive.SubmenuRoot;
const DropdownMenuPortal = MenuPrimitive.Portal;
const DropdownMenuFilter = MenuPrimitive.FilterProvider;
const dropdownItemStyles =
  "flex cursor-pointer items-center gap-2 rounded-[3px] px-2 text-sm text-muted-foreground outline-none transition-colors duration-75 hover:bg-primary/15 hover:text-foreground data-highlighted:bg-primary/15 data-highlighted:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary";

function DropdownMenuTrigger({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Trigger>) {
  return (
    <MenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      className={cn(
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuPositioner({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Positioner>) {
  return (
    <MenuPrimitive.Positioner
      data-slot="dropdown-menu-positioner"
      positionMethod="fixed"
      className={cn("isolate z-50 outline-none", className)}
      {...props}
    />
  );
}

function DropdownMenuContent({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Popup>) {
  return (
    <MenuPrimitive.Popup
      data-slot="dropdown-menu-content"
      className={cn(
        "z-50 max-h-(--available-height) w-(--anchor-width) min-w-60 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-[2px] bg-popover p-1 text-popover-foreground outline-none duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(dropdownItemStyles, "min-h-9", className)}
      {...props}
    />
  );
}

function DropdownMenuSubmenuTrigger({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.SubmenuTrigger>) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-submenu-trigger"
      className={cn(
        dropdownItemStyles,
        "min-h-9 data-popup-open:bg-primary/15 data-popup-open:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuInput({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Input>) {
  return (
    <MenuPrimitive.Input
      data-slot="dropdown-menu-input"
      className={cn(
        "h-8 w-full min-w-0 rounded-[2px] bg-foreground/10 px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:bg-foreground/15 data-highlighted:ring-2 data-highlighted:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuClear({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Clear>) {
  return (
    <MenuPrimitive.Clear
      type="button"
      data-slot="dropdown-menu-clear"
      className={cn(
        "flex size-6 items-center justify-center rounded-[2px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuList({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.List>) {
  return (
    <MenuPrimitive.List
      data-slot="dropdown-menu-list"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}

function DropdownMenuEmpty({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Empty>) {
  return (
    <MenuPrimitive.Empty
      data-slot="dropdown-menu-empty"
      className={cn("px-2.5 py-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function DropdownMenuRadioGroup({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.RadioGroup>) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      className={className}
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(dropdownItemStyles, "min-h-9.5", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof SeparatorPrimitive>) {
  return (
    <SeparatorPrimitive
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuClear,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuFilter,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSubmenu,
  DropdownMenuSubmenuTrigger,
  DropdownMenuTrigger,
};
