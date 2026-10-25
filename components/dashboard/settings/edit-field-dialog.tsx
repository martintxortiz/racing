"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DialogBackdrop,
  DialogHeader,
  DialogPopup,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-message";

type EditFieldFormProps = {
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  submitLabel?: string;
  status?: (props: {
    value: string;
    setSubmittable: (submittable: boolean) => void;
  }) => React.ReactNode;
  onSubmit: (value: string) => Promise<unknown>;
  onClose: () => void;
};

export default function EditFieldDialog({
  open,
  onOpenChange,
  title,
  description,
  ...form
}: Omit<EditFieldFormProps, "onClose"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <DialogBackdrop />
        <DialogPopup>
          <DialogHeader title={title} description={description} />
          <EditFieldForm {...form} onClose={() => onOpenChange(false)} />
        </DialogPopup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditFieldForm({
  label,
  placeholder,
  defaultValue = "",
  submitLabel = "Save",
  status,
  onSubmit,
  onClose,
}: EditFieldFormProps) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [submittable, setSubmittable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(value);
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
        {(label || status) && (
          <div className="flex items-center justify-between gap-2">
            {label ? <Label htmlFor={id}>{label}</Label> : <span />}
            {status?.({ value, setSubmittable })}
          </div>
        )}
        <Input
          id={id}
          name="value"
          value={value}
          placeholder={placeholder}
          variant="card"
          className="w-full"
          onChange={(event) => {
            setValue(event.target.value);
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
          disabled={!submittable}
          className="w-full"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
