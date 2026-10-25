import type { ReactNode } from "react";

import PageTopbar from "@/components/dashboard/page-topbar";

export default function PageShell({
  children,
  showTopbar = false,
}: {
  children?: ReactNode;
  showTopbar?: boolean;
}) {
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      {showTopbar && <PageTopbar />}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col p-6">{children}</div>
      </div>
    </main>
  );
}
