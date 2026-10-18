"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
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
        <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 flex w-96 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-[2px] bg-popover p-4 text-popover-foreground outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="flex flex-col gap-1">
            <Dialog.Title className="text-base font-medium">
              {title}
            </Dialog.Title>
            {description && (
              <Dialog.Description className="text-sm text-muted-foreground">
                {description}
              </Dialog.Description>
            )}
          </div>
          <EditFieldForm {...form} onClose={() => onOpenChange(false)} />
        </Dialog.Popup>
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
      {error && <p className="text-sm text-destructive">{error}</p>}
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
