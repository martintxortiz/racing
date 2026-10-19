"use client";

import { Dialog } from "@base-ui/react/dialog";

import { Button } from "@/components/ui/button";

export default function ConfirmDisableGoogleDialog({
  open,
  onOpenChange,
  loading,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 flex w-96 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-[2px] bg-popover p-4 text-popover-foreground outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="flex flex-col gap-1">
            <Dialog.Title className="text-base font-medium">
              Disable Google sign in?
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              You can still sign in with your password, but Google will be
              disconnected from this account.
            </Dialog.Description>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="card"
              type="button"
              className="w-full"
              disabled={loading}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              type="button"
              className="w-full"
              loading={loading}
              onClick={onConfirm}
            >
              Disable Google
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
