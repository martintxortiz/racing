"use client";

import {
  Add,
  ChevronDown,
  Filter,
  OverflowMenuVertical,
  Search,
  Upload,
} from "@carbon/icons-react";
import { Tabs } from "@base-ui/react/tabs";
import { useMemo, useState } from "react";

import DataTable, { type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LibraryEvent, LibrarySession } from "@/lib/openf1";

const slug = (...parts: string[]) =>
  parts.join("_").trim().toLowerCase().replace(/\s+/g, "_");

const startStamp = (row: { startDate: string }) =>
  row.startDate.replaceAll("-", "");

const sessionName = (row: LibrarySession) =>
  slug(row.eventName, row.type, startStamp(row));

const eventName = (row: LibraryEvent) => slug(row.name, startStamp(row));

const sessionEventName = (row: LibrarySession) =>
  slug(row.eventName, startStamp(row));

const nameCell = (name: string, detail: string) => (
  <>
    <div className="block truncate font-medium text-brand">{name}</div>
    <div className="truncate text-xs text-muted-foreground">{detail}</div>
  </>
);

const brandCell = (value: string) => (
  <span className="block truncate text-brand">{value}</span>
);

type StartTimeRow = {
  dateStart: string;
  startDate: string;
  startTime: string;
};

const startTimeColumn = {
  id: "start-time",
  header: "Start time",
  width: 144,
  value: (row: StartTimeRow) => Date.parse(row.dateStart),
  cell: (row: StartTimeRow) => (
    <>
      <div className="truncate">{row.startDate}</div>
      <div className="truncate text-xs text-muted-foreground">
        {row.startTime}
      </div>
    </>
  ),
} satisfies DataTableColumn<StartTimeRow>;

const actionsColumn = {
  id: "actions",
  header: "",
  width: 56,
  value: () => "",
  cell: () => (
    <span className="flex size-8 items-center justify-center text-muted-foreground">
      <OverflowMenuVertical aria-hidden="true" size={16} />
    </span>
  ),
} satisfies DataTableColumn<unknown>;

const sessionColumns: DataTableColumn<LibrarySession>[] = [
  {
    id: "session",
    header: "Name",
    width: 360,
    value: sessionName,
    cell: (row) => nameCell(sessionName(row), `${row.id} · 245.2 KB`),
  },
  startTimeColumn,
  {
    id: "imported-at",
    header: "Imported At",
    width: 160,
    value: (row) => row.importedAt,
    cell: (row) => (
      <>
        <div>{row.importedAt.slice(0, 10)}</div>
        <div className="text-xs text-muted-foreground">
          {row.importedAt.slice(11, 19)} UTC
        </div>
      </>
    ),
  },
  {
    id: "event",
    header: "Event",
    width: 240,
    value: sessionEventName,
    cell: (row) => brandCell(sessionEventName(row)),
  },
  actionsColumn,
];

const eventColumns: DataTableColumn<LibraryEvent>[] = [
  {
    id: "event",
    header: "Name",
    width: 240,
    value: eventName,
    cell: (row) => nameCell(eventName(row), row.id),
  },
  startTimeColumn,
  {
    id: "sessions",
    header: "Sessions",
    width: 96,
    value: (row) => row.sessions.length,
    cell: (row) => row.sessions.length,
  },
  {
    id: "track",
    header: "Track",
    width: 200,
    value: (row) => row.track,
    cell: (row) => brandCell(row.track),
  },
  actionsColumn,
];

const tabClassName =
  "h-10 border-b-2 border-transparent px-4 text-sm text-muted-foreground outline-none transition-colors data-active:border-brand data-active:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const panelClassName = "flex min-h-0 flex-1 flex-col";
const defaultSort = {
  columnId: "start-time",
  direction: "descending",
} as const;

const getRowId = (row: { id: string }) => row.id;

const matchesSearch = (values: string[], search: string) => {
  const query = search.toLowerCase();
  return !query || values.some((value) => value.toLowerCase().includes(query));
};

export default function LibraryTable({
  sessions,
  events,
}: {
  sessions: LibrarySession[];
  events: LibraryEvent[];
}) {
  const [tab, setTab] = useState("sessions");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const isSessions = tab === "sessions";
  const filterNoun = isSessions ? "session type" : "track";
  const ActionIcon = isSessions ? Upload : Add;
  const options = useMemo(
    () =>
      [
        ...new Set(
          isSessions
            ? sessions.map((row) => row.type)
            : events.map((row) => row.track),
        ),
      ].sort(),
    [events, isSessions, sessions],
  );
  const filteredSessions = useMemo(
    () =>
      sessions.filter(
        (row) =>
          (!filter || row.type === filter) &&
          matchesSearch(
            [
              row.name,
              row.type,
              row.id,
              row.startDate,
              row.startTime,
              row.eventName,
              row.importedAt,
            ],
            search,
          ),
      ),
    [filter, search, sessions],
  );
  const filteredEvents = useMemo(
    () =>
      events.filter(
        (row) =>
          (!filter || row.track === filter) &&
          matchesSearch(
            [row.name, row.id, row.startDate, row.startTime, row.track],
            search,
          ),
      ),
    [events, filter, search],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2px] border border-border/60 bg-card">
      <Tabs.Root
        value={tab}
        className="flex min-h-0 flex-1 flex-col"
        onValueChange={(value) => {
          setTab(value);
          setFilter("");
        }}
      >
        <Tabs.List
          aria-label="Library"
          className="flex shrink-0 gap-1 border-b border-border/60 bg-muted/40 px-2"
        >
          <Tabs.Tab value="sessions" className={tabClassName}>
            Sessions
          </Tabs.Tab>
          <Tabs.Tab value="events" className={tabClassName}>
            Events
          </Tabs.Tab>
        </Tabs.List>
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2 pb-0.5">
          <label className="relative w-full sm:w-80">
            <Search
              aria-hidden="true"
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search library"
              placeholder="Search library"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              variant="card"
              className="h-8 w-full pl-8 pr-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="relative">
            <Filter
              aria-hidden="true"
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <select
              aria-label={`Filter by ${filterNoun}`}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="h-8 min-w-44 appearance-none rounded-[2px] bg-foreground/10 py-1 pl-8 pr-8 text-sm text-foreground transition-colors hover:bg-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All {filterNoun}s</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>
          <Button type="button" className="ml-auto h-8 px-3 text-sm">
            <ActionIcon aria-hidden="true" size={16} />
            {isSessions ? "Import" : "New Event"}
          </Button>
        </div>
        <Tabs.Panel value="sessions" keepMounted className={panelClassName}>
          <DataTable
            rows={filteredSessions}
            columns={sessionColumns}
            getRowId={getRowId}
            defaultSort={defaultSort}
          />
        </Tabs.Panel>
        <Tabs.Panel value="events" keepMounted className={panelClassName}>
          <DataTable
            rows={filteredEvents}
            columns={eventColumns}
            getRowId={getRowId}
            defaultSort={defaultSort}
          />
        </Tabs.Panel>
      </Tabs.Root>
    </div>
  );
}
