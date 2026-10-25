import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";

export default function SettingsRow({
  label,
  value,
  action,
  variant,
  leading,
  loading,
  disabled,
  onAction,
}: {
  label: string;
  value?: string;
  action?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  leading?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[2px] bg-muted px-5 py-4">
      {leading}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {value && (
          <span className="truncate text-sm text-muted-foreground">
            {value}
          </span>
        )}
      </div>
      {action && (
        <Button
          variant={variant ?? "secondary"}
          loading={loading}
          disabled={disabled}
          onClick={onAction}
          className={
            variant
              ? "shrink-0 px-3"
              : "shrink-0 bg-foreground/5 hover:bg-foreground/10 px-3 text-foreground"
          }
        >
          {action}
        </Button>
      )}
    </div>
  );
}
