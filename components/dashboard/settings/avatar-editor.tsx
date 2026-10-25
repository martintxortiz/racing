"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Edit } from "@carbon/icons-react";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";

import AccountAvatar from "@/components/dashboard/account-avatar";
import { Button } from "@/components/ui/button";
import {
  DialogBackdrop,
  DialogHeader,
  DialogPopup,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import {
  maxOffset,
  toAvatarDataUrl,
  type Offset,
  type Size,
} from "@/lib/avatar";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";

const clamp = (value: number, max: number) =>
  Math.max(-max, Math.min(max, value));

export default function AvatarEditor({
  src,
  name,
}: {
  src?: string | null;
  name?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    start: Offset;
    size: number;
  } | null>(null);
  const updateAvatar = useMutation(api.users.updateAvatar);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setNatural(null);
    setOffset({ x: 0, y: 0 });
    setError(null);
  };

  const applyZoom = (next: number) => {
    setZoom(next);
    if (natural) {
      const max = maxOffset(natural, next);
      setOffset((o) => ({ x: clamp(o.x, max.x), y: clamp(o.y, max.y) }));
    }
  };

  const handleSave = async () => {
    if (!file || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateAvatar({ image: await toAvatarDataUrl(file, zoom, offset) });
      reset();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Change avatar"
        onClick={() => inputRef.current?.click()}
        className="group relative size-10 shrink-0 cursor-pointer rounded-[2px]"
      >
        <AccountAvatar src={src} name={name} className="size-full" />
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center rounded-[2px] bg-black/40 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        >
          <Edit />
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const bitmap = await createImageBitmap(file);
          setNatural({ width: bitmap.width, height: bitmap.height });
          bitmap.close();
          setZoom(1);
          setOffset({ x: 0, y: 0 });
          setError(null);
          setFile(file);
          setPreview(URL.createObjectURL(file));
        }}
      />

      <Dialog.Root
        open={preview !== null}
        onOpenChange={(open) => !open && reset()}
      >
        <Dialog.Portal>
          <DialogBackdrop />
          <DialogPopup>
            <DialogHeader
              title="Change Avatar"
              description="Drag to reposition and use the slider to zoom."
            />

            <div
              className={cn(
                "relative aspect-square w-full touch-none overflow-hidden rounded-[2px] border border-white/40 bg-muted",
                dragging ? "cursor-grabbing" : "cursor-grab",
              )}
              onPointerDown={(event) => {
                if (!natural) return;
                dragRef.current = {
                  x: event.clientX,
                  y: event.clientY,
                  start: offset,
                  size: event.currentTarget.getBoundingClientRect().width,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(true);
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || !natural) return;
                const max = maxOffset(natural, zoom);
                setOffset({
                  x: clamp(
                    drag.start.x + (event.clientX - drag.x) / drag.size,
                    max.x,
                  ),
                  y: clamp(
                    drag.start.y + (event.clientY - drag.y) / drag.size,
                    max.y,
                  ),
                });
              }}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element -- blob URL preview
                <img
                  src={preview}
                  alt=""
                  draggable={false}
                  className="size-full object-cover"
                  style={{
                    transform: `translate(${offset.x * 100}%, ${offset.y * 100}%) scale(${zoom})`,
                  }}
                />
              )}
              <div aria-hidden className="pointer-events-none absolute inset-0">
                <span className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
                <span className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
                <span className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
                <span className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
              </div>
            </div>

            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              aria-label="Zoom"
              onChange={(event) => applyZoom(Number(event.target.value))}
              className="w-full cursor-pointer accent-brand"
            />

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
                type="button"
                loading={saving}
                className="w-full"
                onClick={handleSave}
              >
                Save
              </Button>
            </div>
          </DialogPopup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
