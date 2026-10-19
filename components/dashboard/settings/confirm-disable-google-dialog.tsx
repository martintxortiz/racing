"use client";

import { Dialog } from "@base-ui/react/dialog";

import { Button } from "@/components/ui/button";
import {
  DialogBackdrop,
  DialogHeader,
  DialogPopup,
} from "@/components/ui/dialog";

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
        <DialogBackdrop />
        <DialogPopup>
          <DialogHeader
            title="Disable Google sign in?"
            description="You can still sign in with your password, but Google will be disconnected from this account."
          />
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
        </DialogPopup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
