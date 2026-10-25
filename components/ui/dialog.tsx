import { Dialog } from "@base-ui/react/dialog";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function DialogHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Dialog.Title className="text-base font-medium">{title}</Dialog.Title>
      {description && (
        <Dialog.Description className="text-sm text-muted-foreground">
          {description}
        </Dialog.Description>
      )}
    </div>
  );
}

export function DialogBackdrop() {
  return (
    <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
  );
}

export function DialogPopup({
  className,
  ...props
}: ComponentProps<typeof Dialog.Popup>) {
  return (
    <Dialog.Popup
      className={cn(
        "fixed top-1/2 left-1/2 flex w-96 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-[2px] bg-popover p-4 text-popover-foreground outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className,
      )}
      {...props}
    />
  );
}
