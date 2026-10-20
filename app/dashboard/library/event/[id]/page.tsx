import Link from "next/link";
import { notFound } from "next/navigation";

import PageShell from "@/components/dashboard/page-shell";
import { getOpenF1LibraryData } from "@/lib/openf1";

const linkClassName = "text-brand underline underline-offset-4";

export default async function EventPage({
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

  const event = data.events.find((row) => row.id === id);
  if (!event) notFound();

  const rows = [
    {
      label: "Track",
      value: (
        <Link
          href={`/dashboard/library/track/${encodeURIComponent(event.track)}`}
          className={linkClassName}
        >
          {event.track}
        </Link>
      ),
    },
    { label: "Sessions", value: event.sessions.length },
    { label: "Start time", value: `${event.startDate} ${event.startTime}` },
  ];

  return (
    <PageShell>
      <div className="max-w-2xl overflow-hidden rounded-[2px] border border-border/60 bg-card">
        <div className="border-b border-border/60 px-4 py-3">
          <p className="text-xs text-muted-foreground">Event</p>
          <h1 className="text-lg font-medium">{event.name}</h1>
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
