"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function SettingsOriginTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/dashboard/settings")) {
      sessionStorage.setItem("settingsOrigin", pathname);
    }
  }, [pathname]);

  return null;
}
