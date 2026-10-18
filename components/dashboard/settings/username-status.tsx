"use client";

import { CheckmarkFilled, CloseFilled } from "@carbon/icons-react";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { normalizeUsername, usernamePattern } from "@/lib/auth-validation";

export default function UsernameStatus({
  value,
  currentUsername,
  onSubmittableChange,
}: {
  value: string;
  currentUsername?: string;
  onSubmittableChange: (submittable: boolean) => void;
}) {
  const normalized = normalizeUsername(value);
  const valid = usernamePattern.test(normalized);
  const isCurrent = normalized === normalizeUsername(currentUsername ?? "");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    if (!valid) return;
    const timeout = window.setTimeout(() => setDebounced(normalized), 300);
    return () => window.clearTimeout(timeout);
  }, [normalized, valid]);

  const available = useQuery(
    api.users.isUsernameAvailable,
    valid && !isCurrent && debounced === normalized
      ? { username: normalized }
      : "skip",
  );

  const checking =
    !isCurrent && (debounced !== normalized || available === undefined);
  const submittable = valid && (isCurrent || (!checking && available === true));

  useEffect(() => {
    onSubmittableChange(submittable);
  }, [submittable, onSubmittableChange]);

  if (value.length === 0) return null;

  if (!valid) {
    return (
      <span className="text-xs text-destructive">
        Use 3–20 letters, numbers, or underscores
      </span>
    );
  }

  if (checking) {
    return (
      <span
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <Spinner size={12} /> Checking…
      </span>
    );
  }

  if (!isCurrent && available === false) {
    return (
      <span
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-xs text-destructive"
      >
        <CloseFilled size={12} /> Username taken
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400"
    >
      <CheckmarkFilled size={12} /> Available
    </span>
  );
}
