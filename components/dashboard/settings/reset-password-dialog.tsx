"use client";

import { Dialog } from "@base-ui/react/dialog";

import { Button } from "@/components/ui/button";

export default function ResetPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 flex w-96 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-[2px] bg-popover p-4 text-popover-foreground outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="flex flex-col gap-1">
            <Dialog.Title className="text-base font-medium">
              Reset Password
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              We&apos;ll email you a link to reset your password.
            </Dialog.Description>
          </div>
          {/* shortcut: reset email isn't wired up, the button just closes */}
          <div className="flex gap-2">
            <Dialog.Close
              render={<Button variant="card" type="button" />}
              className="w-full"
            >
              Cancel
            </Dialog.Close>
            <Dialog.Close render={<Button type="button" />} className="w-full">
              Send Email
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
