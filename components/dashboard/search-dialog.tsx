"use client";

import { Fade, Search, User } from "@carbon/icons-react";
import { Dialog } from "@base-ui/react/dialog";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";

const settingsItems = [
  {
    label: "Account",
    keywords: "profile username email",
    href: "/dashboard/settings",
    icon: <User className="size-4 text-muted-foreground" aria-hidden="true" />,
  },
  {
    label: "Username",
    keywords: "account profile",
    href: "/dashboard/settings",
    icon: <User className="size-4 text-muted-foreground" aria-hidden="true" />,
  },
  {
    label: "Email",
    keywords: "account profile",
    href: "/dashboard/settings",
    icon: <User className="size-4 text-muted-foreground" aria-hidden="true" />,
  },
  {
    label: "Subscription",
    keywords: "billing upgrade account",
    href: "/dashboard/settings",
    icon: <User className="size-4 text-muted-foreground" aria-hidden="true" />,
  },
  {
    label: "Profile visibility",
    keywords: "account privacy",
    href: "/dashboard/settings",
    icon: <User className="size-4 text-muted-foreground" aria-hidden="true" />,
  },
  {
    label: "Security",
    keywords: "password google multi-factor",
    href: "/dashboard/settings",
    icon: <User className="size-4 text-muted-foreground" aria-hidden="true" />,
  },
  {
    label: "Password Sign In",
    keywords: "security reset enable",
    href: "/dashboard/settings",
    icon: <User className="size-4 text-muted-foreground" aria-hidden="true" />,
  },
  {
    label: "Google Sign in",
    keywords: "security account",
    href: "/dashboard/settings",
    icon: <User className="size-4 text-muted-foreground" aria-hidden="true" />,
  },
  {
    label: "Multi-factor authentication",
    keywords: "security mfa",
    href: "/dashboard/settings",
    icon: <User className="size-4 text-muted-foreground" aria-hidden="true" />,
  },
  {
    label: "Delete Account",
    keywords: "danger remove",
    href: "/dashboard/settings",
    icon: <User className="size-4 text-muted-foreground" aria-hidden="true" />,
  },
  {
    label: "Appearance",
    keywords: "display theme",
    href: "/dashboard/settings/appearance",
    icon: <Fade className="size-4 text-muted-foreground" aria-hidden="true" />,
  },
  {
    label: "Theme",
    keywords: "appearance display light dark dark mode system",
    href: "/dashboard/settings/appearance",
    icon: <Fade className="size-4 text-muted-foreground" aria-hidden="true" />,
  },
];

export default function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<typeof settingsItems>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !query.trim()) return;

    const timeout = window.setTimeout(() => {
      const queryTerms = query.trim().toLowerCase().split(/\s+/);
      setResults(
        settingsItems.filter((item) => {
          const searchableText = `${item.label} ${item.keywords}`.toLowerCase();
          return queryTerms.every((term) => searchableText.includes(term));
        }),
      );
      setLoading(false);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [open, query]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed top-[20%] left-1/2 flex w-[min(36rem,calc(100vw-3rem))] -translate-x-1/2 flex-col overflow-hidden rounded-[2px] bg-popover text-popover-foreground outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command
            inputValue={query}
            onInputValueChange={(value) => {
              setQuery(value);
              setLoading(Boolean(value.trim()));
            }}
            value={null}
            onValueChange={(href) => {
              if (typeof href !== "string") return;
              const item = settingsItems.find((entry) => entry.label === href);
              if (!item) return;
              onOpenChange(false);
              setQuery("");
              router.push(item.href);
            }}
          >
            <div className="relative border-b p-3">
              <Search
                className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <CommandInput
                aria-label="Search settings"
                placeholder="Search settings..."
                className="pl-9"
              />
            </div>
            <ScrollArea className="h-64">
              {!query.trim() ? (
                <p className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                  Type to Search
                </p>
              ) : loading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner className="text-muted-foreground" />
                </div>
              ) : (
                <CommandList className="flex min-h-full flex-col items-stretch justify-start">
                  {results.length === 0 ? (
                    <p className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
                      No settings found.
                    </p>
                  ) : (
                    results.map((item) => (
                      <CommandItem
                        key={item.label}
                        value={item.label}
                        className="w-full flex-row items-center justify-start gap-3 text-left"
                      >
                        {item.icon}
                        {item.label}
                      </CommandItem>
                    ))
                  )}
                </CommandList>
              )}
            </ScrollArea>
          </Command>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
