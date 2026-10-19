import { Suspense } from "react";

import LibraryLoading from "@/components/dashboard/library-loading";
import LibraryTable from "@/components/dashboard/library-table";
import PageShell from "@/components/dashboard/page-shell";
import { getOpenF1LibraryData } from "@/lib/openf1";

async function LibraryData() {
  const data = await getOpenF1LibraryData().catch(() => null);
  if (!data) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        F1 data is unavailable right now. Please try again later.
      </p>
    );
  }
  return <LibraryTable {...data} />;
}

export default function LibraryPage() {
  return (
    <PageShell>
      <Suspense fallback={<LibraryLoading />}>
        <LibraryData />
      </Suspense>
    </PageShell>
  );
}
