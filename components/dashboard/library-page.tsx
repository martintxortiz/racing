import LibraryTable from "@/components/dashboard/library-table";
import PageShell from "@/components/dashboard/page-shell";
import { getOpenF1LibraryData } from "@/lib/openf1";

export default async function LibraryPage() {
  try {
    const data = await getOpenF1LibraryData();
    return (
      <PageShell>
        <LibraryTable {...data} />
      </PageShell>
    );
  } catch {
    return (
      <PageShell showTopbar>
        <h1 className="mb-5 text-2xl font-semibold leading-tight">Library</h1>
        <p role="alert" className="text-sm text-muted-foreground">
          F1 data is unavailable right now. Please try again later.
        </p>
      </PageShell>
    );
  }
}
