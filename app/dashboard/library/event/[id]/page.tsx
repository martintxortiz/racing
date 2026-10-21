"use client";

import { useQuery } from "convex/react";
import { notFound } from "next/navigation";
import { use } from "react";

import PageShell from "@/components/dashboard/page-shell";
import { api } from "@/convex/_generated/api";

export default function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const event = useQuery(api.events.get, { id });

  if (event === undefined) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Loading event…</p>
      </PageShell>
    );
  }
  if (!event) notFound();

  const rows = [
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
