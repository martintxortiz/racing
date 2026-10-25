"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import SettingsSection from "@/components/dashboard/settings/settings-section";
import SettingsShell from "@/components/dashboard/settings/settings-shell";

const themes = ["light", "system", "dark"] as const;
const subscribe = () => () => {};

export default function AppearancePage() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return (
    <SettingsShell>
      <SettingsSection title="Display">
        <div className="flex items-center justify-between gap-6 rounded-[2px] bg-muted px-5 py-3">
          <div>
            <h2 className="text-sm font-medium">Theme</h2>
            <p className="text-sm text-muted-foreground">
              Choose how Prisma looks on this device.
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="grid w-72 shrink-0 grid-cols-3 gap-3"
          >
            {themes.map((option) => {
              const selected = mounted && (theme ?? "system") === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(option)}
                  className={`rounded-md border p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-brand" : "border-border hover:border-foreground/40"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-10 overflow-hidden rounded-[3px] border ${option === "dark" ? "border-white/15 bg-[#191919]" : "border-black/10 bg-white"}`}
                  >
                    {option === "system" ? (
                      <>
                        <span className="w-1/2 bg-white p-1">
                          <span className="block h-1 w-4 bg-blue-500" />
                          <span className="mt-1 block h-1 w-full bg-slate-200" />
                        </span>
                        <span className="w-1/2 bg-[#191919] p-1">
                          <span className="block h-1 w-4 bg-blue-500" />
                          <span className="mt-1 block h-1 w-full bg-white/20" />
                        </span>
                      </>
                    ) : (
                      <span className="w-full p-1.5">
                        <span className="block h-1 w-5 bg-blue-500" />
                        <span
                          className={`mt-1 block h-1 w-full ${option === "dark" ? "bg-white/20" : "bg-slate-200"}`}
                        />
                        <span
                          className={`mt-1 block h-1 w-3/4 ${option === "dark" ? "bg-white/20" : "bg-slate-200"}`}
                        />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </SettingsSection>
    </SettingsShell>
  );
}
