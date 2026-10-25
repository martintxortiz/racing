"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useTheme } from "next-themes";

import { api } from "@/convex/_generated/api";
import AccountAvatar from "./account-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Download, Help, Logout, Rocket, Settings } from "@carbon/icons-react";

const AccountMenu = () => {
  const { theme, setTheme } = useTheme();
  const me = useQuery(api.users.me);
  const currentTheme = theme ?? "system";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open account menu"
        className="group relative size-9 cursor-pointer rounded-[2px] p-0"
      >
        <AccountAvatar
          src={me?.image}
          name={me?.username}
          className="size-full"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-[2px] bg-black/20 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuPositioner side="right" align="end" sideOffset={8}>
          <DropdownMenuContent>
            <DropdownMenuItem
              render={<Link href="/auth/sign-out" />}
              className="hover:!bg-transparent"
            >
              <div className="flex min-w-0 flex-col opacity-80 hover:opacity-100 transition-opacity duration-75 cursor-pointer group">
                <span className="text-foreground text-sm ">
                  {me?.username ?? "—"}
                </span>
                <span className="text-muted-foreground text-sm truncate">
                  {me?.email ?? "—"}
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
              <Settings className="size-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/dashboard/plan" />}>
              <Rocket className="size-4" />
              <span>Upgrade</span>
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/dashboard/help" />}>
              <Help className="size-4" />
              <span>Help</span>
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/dashboard/client" />}>
              <Download className="size-4" />
              <span>Client</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={currentTheme}
              onValueChange={setTheme}
            >
              {(["light", "dark", "system"] as const).map((value) => (
                <DropdownMenuRadioItem
                  key={value}
                  value={value}
                  closeOnClick={false}
                >
                  <span
                    aria-hidden
                    className="flex size-4 shrink-0 items-center"
                  >
                    <span
                      className={`size-2 rounded-full bg-current ${
                        currentTheme === value ? "visible" : "invisible"
                      }`}
                    />
                  </span>
                  {value[0].toUpperCase() + value.slice(1)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={<Link href="/auth/sign-out" />}
              className="hover:!text-danger-strong hover:!bg-danger-strong/15"
            >
              <Logout className="size-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPositioner>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
};

export default AccountMenu;
