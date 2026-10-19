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

const formatSessionName = (row: LibrarySession) =>
  `${row.eventName}_${row.type}_${row.startDate.replaceAll("-", "")}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
const formatEventName = (row: LibraryEvent) =>
  `${row.name}_${row.startDate.replaceAll("-", "")}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const sessionColumns: DataTableColumn<LibrarySession>[] = [
  {
    id: "session",
    header: "Name",
    width: 360,
    value: formatSessionName,
    cell: (row) => (
      <>
        <div className="block truncate font-medium text-brand">
          {formatSessionName(row)}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {row.id} · 245.2 KB
        </div>
      </>
    ),
  },
  {
    id: "start-time",
    header: "Start time",
    width: 144,
    value: (row) => Date.parse(row.dateStart),
    cell: (row) => (
      <>
        <div className="truncate">{row.startDate}</div>
        <div className="truncate text-xs text-muted-foreground">
          {row.startTime}
        </div>
      </>
    ),
  },
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
    header: "Name",
    width: 240,
    value: (row) => row.eventName,
    cell: (row) => (
      <span className="block truncate text-brand">{row.eventName}</span>
    ),
  },
  {
    id: "car",
    header: "CAR",
    width: 88,
    value: () => "—",
    cell: () => <span className="text-muted-foreground">—</span>,
  },
  {
    id: "actions",
    header: "",
    width: 56,
    value: () => "",
    cell: () => (
      <span className="flex size-8 items-center justify-center text-muted-foreground">
        <OverflowMenuVertical aria-hidden="true" size={16} />
      </span>
    ),
  },
];

const eventColumns: DataTableColumn<LibraryEvent>[] = [
  {
    id: "event",
    header: "Name",
    width: 240,
    value: formatEventName,
    cell: (row) => (
      <>
        <div className="block truncate font-medium text-brand">
          {formatEventName(row)}
        </div>
        <div className="truncate text-xs text-muted-foreground">{row.id}</div>
      </>
    ),
  },
  {
    id: "start-time",
    header: "Start time",
    width: 144,
    value: (row) => Date.parse(row.dateStart),
    cell: (row) => (
      <>
        <div className="truncate">{row.startDate}</div>
        <div className="truncate text-xs text-muted-foreground">
          {row.startTime}
        </div>
      </>
    ),
  },
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
    cell: (row) => (
      <span className="block truncate text-brand">{row.track}</span>
    ),
  },
  {
    id: "actions",
    header: "",
    width: 56,
    value: () => "",
    cell: () => (
      <span className="flex size-8 items-center justify-center text-muted-foreground">
        <OverflowMenuVertical aria-hidden="true" size={16} />
      </span>
    ),
  },
];

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
          (!search ||
            [
              row.name,
              row.type,
              row.id,
              row.startDate,
              row.startTime,
              row.eventName,
              row.importedAt,
            ].some((value) =>
              value.toLowerCase().includes(search.toLowerCase()),
            )),
      ),
    [filter, search, sessions],
  );
  const filteredEvents = useMemo(
    () =>
      events.filter(
        (row) =>
          (!filter || row.track === filter) &&
          (!search ||
            [row.name, row.id, row.startDate, row.startTime, row.track].some(
              (value) => value.toLowerCase().includes(search.toLowerCase()),
            )),
      ),
    [events, filter, search],
  );

  return (
    <>
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
            <Tabs.Tab
              value="sessions"
              className="h-10 border-b-2 border-transparent px-4 text-sm text-muted-foreground outline-none transition-colors data-active:border-brand data-active:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              Sessions
            </Tabs.Tab>
            <Tabs.Tab
              value="events"
              className="h-10 border-b-2 border-transparent px-4 text-sm text-muted-foreground outline-none transition-colors data-active:border-brand data-active:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
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
              <label className="sr-only" htmlFor="library-filter">
                Filter by {isSessions ? "session type" : "track"}
              </label>
              <select
                id="library-filter"
                aria-label={`Filter by ${isSessions ? "session type" : "track"}`}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="h-8 min-w-44 appearance-none rounded-[2px] bg-foreground/10 py-1 pl-8 pr-8 text-sm text-foreground transition-colors hover:bg-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">
                  All {isSessions ? "session types" : "tracks"}
                </option>
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
              {isSessions ? (
                <Upload aria-hidden="true" size={16} />
              ) : (
                <Add aria-hidden="true" size={16} />
              )}
              {isSessions ? "Import" : "New Event"}
            </Button>
          </div>
          <Tabs.Panel
            value="sessions"
            keepMounted
            className="flex min-h-0 flex-1 flex-col"
          >
            <DataTable
              rows={filteredSessions}
              columns={sessionColumns}
              getRowId={(row) => row.id}
              defaultSort={{ columnId: "start-time", direction: "descending" }}
            />
          </Tabs.Panel>
          <Tabs.Panel
            value="events"
            keepMounted
            className="flex min-h-0 flex-1 flex-col"
          >
            <DataTable
              rows={filteredEvents}
              columns={eventColumns}
              getRowId={(row) => row.id}
              defaultSort={{ columnId: "start-time", direction: "descending" }}
            />
          </Tabs.Panel>
        </Tabs.Root>
      </div>
    </>
  );
}
