"use client";

import { Information } from "@carbon/icons-react";

import { cn } from "@/lib/utils";

const STRENGTH_COLORS = [
  "bg-foreground/15",
  "bg-danger-strong",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-success-meter",
];

const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"];

function getPasswordStrength(pass: string): number {
  if (!pass) return 0;
  let score = 0;
  if (pass.length >= 8) score++;
  if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score++;
  if (/\d/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;
  return score;
}

// Keep the password strength meter and requirements control; do not remove unless the user explicitly asks.
const PasswordStrength = ({ password }: { password: string }) => {
  const score = getPasswordStrength(password);

  return (
    <div className="flex items-center gap-2">
      <span className="sr-only">
        {password ? `Password strength: ${STRENGTH_LABELS[score]}` : ""}
      </span>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={cn(
              "h-1 w-5.5 rounded-[1px] transition-colors duration-200",
              password && step <= score
                ? STRENGTH_COLORS[score]
                : "bg-foreground/15",
            )}
          />
        ))}
      </div>

      <div className="group relative flex items-center">
        <button
          type="button"
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground"
          aria-label="Password requirements"
          aria-describedby="password-requirements"
        >
          <Information size={14} />
        </button>
        <div
          id="password-requirements"
          className="pointer-events-none absolute right-0 bottom-full z-50 mb-1.5 hidden w-48 rounded-[2px] border border-border bg-muted px-2.5 py-2 text-xs text-foreground group-hover:block group-focus-within:block"
        >
          <p className="mb-1 font-semibold text-muted-foreground">
            Requirements
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
            <li>8+ characters</li>
            <li>Uppercase & lowercase</li>
            <li>At least one number</li>
            <li>Special character</li>
            <li>128 characters maximum</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PasswordStrength;
