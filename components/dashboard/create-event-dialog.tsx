"use client";

import { useMutation } from "convex/react";

import EditFieldDialog from "@/components/dashboard/settings/edit-field-dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type CreateEventDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: Id<"events">) => void;
};

export default function CreateEventDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateEventDialogProps) {
  const create = useMutation(api.events.create);

  return (
    <EditFieldDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Event"
      description="Name the event. Start time defaults to now."
      label="Name"
      placeholder="Event name"
      submitLabel="Create"
      onSubmit={async (name) => {
        const id = await create({ name });
        onCreated?.(id);
      }}
    />
  );
}
