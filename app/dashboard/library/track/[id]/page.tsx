import { notFound } from "next/navigation";

import PageShell from "@/components/dashboard/page-shell";
import { getOpenF1LibraryData } from "@/lib/openf1";

export default async function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getOpenF1LibraryData().catch(() => null);
  if (!data) {
    return (
      <PageShell>
        <p role="alert" className="text-sm text-muted-foreground">
          F1 data is unavailable right now. Please try again later.
        </p>
      </PageShell>
    );
  }

  const track = [...data.sessions, ...data.events].find(
    (row) => row.track === id,
  )?.track;
  if (!track) notFound();

  return (
    <PageShell>
      <div className="flex flex-1 items-center justify-center">
        <h1 className="text-2xl font-medium">{track}</h1>
      </div>
    </PageShell>
  );
}
