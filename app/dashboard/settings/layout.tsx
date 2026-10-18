"use client";

import { useRouter } from "next/navigation";

import PageSidebar from "@/components/dashboard/page-sidebar";
import {
  ArrowLeft,
  Db2Database,
  Enterprise,
  Fade,
  Purchase,
  User,
} from "@carbon/icons-react";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="flex h-screen w-full flex-1">
      <PageSidebar
        items={[
          {
            icon: <ArrowLeft className="size-4" />,
            label: "Back",
            onClick: () =>
              router.push(
                sessionStorage.getItem("settingsOrigin") ?? "/dashboard",
              ),
          },
          {
            href: "/dashboard/settings",
            icon: <User className="size-4" />,
            label: "Account",
          },
          {
            href: "/dashboard/settings/appearance",
            icon: <Fade className="size-4" />,
            label: "Appearance",
          },
          {
            href: "/dashboard/settings/data",
            icon: <Db2Database className="size-4" />,
            label: "Data",
          },
          {
            href: "/dashboard/settings/billing",
            icon: <Purchase className="size-4" />,
            label: "Billing",
          },
          {
            href: "/dashboard/settings/team",
            icon: <Enterprise className="size-4" />,
            label: "Team",
          },
        ]}
      />
      {children}
    </div>
  );
}
