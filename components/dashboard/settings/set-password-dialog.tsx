"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useId, useState } from "react";

import PasswordStrength from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import {
  DialogBackdrop,
  DialogHeader,
  DialogPopup,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-message";

type SetPasswordFormProps = {
  onSubmit: (password: string) => Promise<unknown>;
  onClose: () => void;
};

export default function SetPasswordDialog({
  open,
  onOpenChange,
  ...form
}: Omit<SetPasswordFormProps, "onClose"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <DialogBackdrop />
        <DialogPopup>
          <DialogHeader
            title="Enable Password"
            description="Set a password so you can sign in without Google."
          />
          <SetPasswordForm {...form} onClose={() => onOpenChange(false)} />
        </DialogPopup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SetPasswordForm({ onSubmit, onClose }: SetPasswordFormProps) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit(password);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${id}-password`}>New Password</Label>
          <PasswordStrength password={password} />
        </div>
        <Input
          id={`${id}-password`}
          type="password"
          name="password"
          placeholder="Create a password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          variant="card"
          className="w-full"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-confirm`}>Confirm Password</Label>
        <Input
          id={`${id}-confirm`}
          type="password"
          name="confirmPassword"
          placeholder="Confirm your password"
          autoComplete="new-password"
          required
          maxLength={128}
          variant="card"
          className="w-full"
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            setError(null);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Dialog.Close
          render={<Button variant="card" type="button" />}
          className="w-full"
        >
          Cancel
        </Dialog.Close>
        <Button
          type="submit"
          loading={loading}
          disabled={!password || !confirmPassword}
          className="w-full"
        >
          Save
        </Button>
      </div>
    </form>
  );
}
