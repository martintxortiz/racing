"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { generatedAvatarUrl } from "@/lib/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function AccountAvatar({
  src,
  name,
  className,
}: {
  src?: string | null;
  name?: string | null;
  className?: string;
}) {
  const initials = (name ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase();

  const [imageFailed, setImageFailed] = useState(false);

  const fallbackSrc = name ? generatedAvatarUrl(name) : null;
  const imageSrc = !imageFailed && src ? src : fallbackSrc;

  return (
    <Avatar
      className={cn(
        "relative inline-flex overflow-hidden rounded-[2px] border",
        className,
      )}
    >
      <AvatarFallback className="flex size-full items-center justify-center rounded-[2px] bg-foreground/10 text-sm font-medium text-muted-foreground">
        {initials || "?"}
      </AvatarFallback>
      {imageSrc ? (
        <AvatarImage
          src={imageSrc}
          alt=""
          referrerPolicy="no-referrer"
          onLoadingStatusChange={(status) => {
            if (status === "error") setImageFailed(true);
          }}
          className="block size-full rounded-[2px] object-cover"
        />
      ) : null}
    </Avatar>
  );
}
