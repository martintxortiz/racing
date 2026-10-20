import Link from "next/link";
import { notFound } from "next/navigation";

import PageShell from "@/components/dashboard/page-shell";
import { getOpenF1LibraryData } from "@/lib/openf1";

const linkClassName = "text-brand underline underline-offset-4";

export default async function SessionPage({
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

  const session = data.sessions.find((row) => row.id === id);
  if (!session) notFound();

  const rows = [
    {
      label: "Event",
      value: (
        <Link
          href={`/dashboard/library/event/${session.eventId}`}
          className={linkClassName}
        >
          {session.eventName}
        </Link>
      ),
    },
    {
      label: "Track",
      value: (
        <Link
          href={`/dashboard/library/track/${encodeURIComponent(session.track)}`}
          className={linkClassName}
        >
          {session.track}
        </Link>
      ),
    },
    { label: "Type", value: session.type },
    {
      label: "Start time",
      value: `${session.startDate} ${session.startTime}`,
    },
  ];

  return (
    <PageShell>
      <div className="max-w-2xl overflow-hidden rounded-[2px] border border-border/60 bg-card">
        <div className="border-b border-border/60 px-4 py-3">
          <p className="text-xs text-muted-foreground">Session</p>
          <h1 className="text-lg font-medium">{session.name}</h1>
        </div>
        <dl className="divide-y divide-border/60 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex gap-4 px-4 py-2.5">
              <dt className="w-32 shrink-0 text-muted-foreground">
                {row.label}
              </dt>
              <dd className="min-w-0 truncate">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </PageShell>
  );
}
