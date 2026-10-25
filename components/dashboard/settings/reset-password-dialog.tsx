"use client";

import { Dialog } from "@base-ui/react/dialog";

import { Button } from "@/components/ui/button";
import {
  DialogBackdrop,
  DialogHeader,
  DialogPopup,
} from "@/components/ui/dialog";

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
        <DialogBackdrop />
        <DialogPopup>
          <DialogHeader
            title="Reset Password"
            description="We'll email you a link to reset your password."
          />
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
        </DialogPopup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
