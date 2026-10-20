"use client";

import {
  Add,
  ChevronRight,
  Close,
  Filter,
  OverflowMenuVertical,
  Search,
  Upload,
} from "@carbon/icons-react";
import { Tabs } from "@base-ui/react/tabs";
import { useMemo, useState } from "react";

import DataTable, { type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import StartTimeFilter from "@/components/dashboard/start-time-filter";
import {
  DropdownMenu,
  DropdownMenuClear,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuFilter,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSubmenu,
  DropdownMenuSubmenuTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRange, matchesRange, type DateRange } from "@/lib/date-range";
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

type FilterFieldId = "type" | "event" | "track";

type FilterOption = {
  value: string;
  label: string;
};

type FilterField = {
  id: FilterFieldId;
  label: string;
  options: FilterOption[];
};

type ActiveFilter = {
  id: string;
  field: FilterFieldId;
  value: string;
};

const unique = (values: string[]) => [...new Set(values)].sort();

const toOptions = (values: string[]) =>
  unique(values).map((value) => ({ value, label: value }));

const matchesFilters = (
  filters: ActiveFilter[],
  field: FilterFieldId,
  value: string,
) => {
  const values = filters.filter((filter) => filter.field === field);
  return values.length === 0 || values.some((filter) => filter.value === value);
};

const filterSearch = (label: string) => (
  <div className="relative mb-1">
    <Search
      aria-hidden="true"
      size={16}
      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
    />
    <DropdownMenuInput
      aria-label={`Search ${label.toLowerCase()}`}
      placeholder={`Search ${label.toLowerCase()}`}
      className="h-8 pl-8 pr-8"
    />
    <DropdownMenuClear
      aria-label={`Clear ${label.toLowerCase()} search`}
      className="absolute right-1 top-1/2 size-6 -translate-y-1/2"
    >
      <Close aria-hidden="true" size={14} />
    </DropdownMenuClear>
  </div>
);

export default function LibraryTable({
  sessions,
  events,
}: {
  sessions: LibrarySession[];
  events: LibraryEvent[];
}) {
  const [tab, setTab] = useState("sessions");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [startTime, setStartTime] = useState<DateRange | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [startTimeOpen, setStartTimeOpen] = useState(false);
  const isSessions = tab === "sessions";
  const ActionIcon = isSessions ? Upload : Add;
  const filterFields = useMemo<FilterField[]>(
    () =>
      isSessions
        ? [
            {
              id: "type",
              label: "Session type",
              options: toOptions(sessions.map((row) => row.type)),
            },
            {
              id: "event",
              label: "Event",
              options: [
                ...new Map(sessions.map((row) => [row.eventId, row])).values(),
              ]
                .map((row) => ({
                  value: String(row.eventId),
                  label: sessionEventName(row),
                }))
                .sort((a, b) => a.label.localeCompare(b.label)),
            },
          ]
        : [
            {
              id: "track",
              label: "Track",
              options: toOptions(events.map((row) => row.track)),
            },
          ],
    [events, isSessions, sessions],
  );
  const hasFilters = filters.length > 0 || startTime !== null;
  const filteredSessions = useMemo(
    () =>
      sessions.filter(
        (row) =>
          matchesFilters(filters, "type", row.type) &&
          matchesFilters(filters, "event", String(row.eventId)) &&
          matchesRange(startTime, row.dateStart) &&
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
    [filters, search, sessions, startTime],
  );
  const filteredEvents = useMemo(
    () =>
      events.filter(
        (row) =>
          matchesFilters(filters, "track", row.track) &&
          matchesRange(startTime, row.dateStart) &&
          matchesSearch(
            [row.name, row.id, row.startDate, row.startTime, row.track],
            search,
          ),
      ),
    [events, filters, search, startTime],
  );

  const addFilter = (field: FilterFieldId, value: string) =>
    setFilters((current) =>
      current.some((filter) => filter.field === field && filter.value === value)
        ? current
        : [...current, { id: `${field}:${value}`, field, value }],
    );
  const removeFilter = (id: string) =>
    setFilters((current) => current.filter((filter) => filter.id !== id));
  const setFilterValue = (id: string, value: string) =>
    setFilters((current) =>
      current.map((filter) =>
        filter.id === id
          ? { ...filter, id: `${filter.field}:${value}`, value }
          : filter,
      ),
    );
  const applyStartTime = (range: DateRange | null) => {
    setStartTime(range);
    setAddOpen(false);
    setStartTimeOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2px] border border-border/60 bg-card">
      <Tabs.Root
        value={tab}
        className="flex min-h-0 flex-1 flex-col"
        onValueChange={(value) => {
          setTab(value);
          setFilters([]);
          setStartTime(null);
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
          <div className="relative w-full sm:w-80">
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
              className="h-8 w-full pl-8 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-[2px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Close aria-hidden="true" size={14} />
              </button>
            )}
          </div>
          {filters.map((activeFilter) => {
            const field = filterFields.find(
              (entry) => entry.id === activeFilter.field,
            );
            if (!field) return null;
            const activeLabel =
              field.options.find(
                (option) => option.value === activeFilter.value,
              )?.label ?? activeFilter.value;
            return (
              <DropdownMenuFilter key={activeFilter.id}>
                <DropdownMenu>
                  <div className="flex h-8 max-w-64 items-center rounded-[2px] bg-foreground/10 text-sm transition-colors hover:bg-foreground/15 focus-within:ring-2 focus-within:ring-ring">
                    <DropdownMenuTrigger
                      aria-label={`Change ${field.label} filter, current value ${activeLabel}`}
                      className="flex h-full min-w-0 items-center gap-1.5 pl-2.5 outline-none focus-visible:ring-0"
                    >
                      <span className="shrink-0 text-muted-foreground">
                        {field.label}:
                      </span>
                      <span className="truncate">{activeLabel}</span>
                    </DropdownMenuTrigger>
                    <button
                      type="button"
                      aria-label={`Remove ${field.label} filter`}
                      onClick={() => removeFilter(activeFilter.id)}
                      className="flex h-full w-7 shrink-0 cursor-pointer items-center justify-center text-muted-foreground outline-none transition-colors hover:text-foreground"
                    >
                      <Close aria-hidden="true" size={14} />
                    </button>
                  </div>
                  <DropdownMenuPortal>
                    <DropdownMenuPositioner align="start" sideOffset={4}>
                      <DropdownMenuContent className="overflow-hidden">
                        {filterSearch(field.label)}
                        <ScrollArea viewportClassName="max-h-72">
                          <DropdownMenuList>
                            <DropdownMenuRadioGroup
                              value={activeFilter.value}
                              onValueChange={(value) =>
                                setFilterValue(activeFilter.id, value)
                              }
                            >
                              {field.options.map((option) => (
                                <DropdownMenuRadioItem
                                  key={option.value}
                                  className="min-h-8"
                                  value={option.value}
                                  disabled={filters.some(
                                    (filter) =>
                                      filter.id !== activeFilter.id &&
                                      filter.field === field.id &&
                                      filter.value === option.value,
                                  )}
                                  closeOnClick
                                >
                                  <span
                                    aria-hidden="true"
                                    className="flex size-4 shrink-0 items-center"
                                  >
                                    <span
                                      className={`size-2 rounded-full bg-current ${
                                        option.value === activeFilter.value
                                          ? "visible"
                                          : "invisible"
                                      }`}
                                    />
                                  </span>
                                  <span className="min-w-0 truncate">
                                    {option.label}
                                  </span>
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuList>
                        </ScrollArea>
                        <DropdownMenuEmpty>No matches.</DropdownMenuEmpty>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => removeFilter(activeFilter.id)}
                          className="min-h-8"
                        >
                          <Close aria-hidden="true" size={14} />
                          Remove filter
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenuPositioner>
                  </DropdownMenuPortal>
                </DropdownMenu>
              </DropdownMenuFilter>
            );
          })}
          {startTime && (
            <DropdownMenu
              open={startTimeOpen}
              onOpenChange={setStartTimeOpen}
              modal={false}
            >
              <div className="flex h-8 max-w-64 items-center rounded-[2px] bg-foreground/10 text-sm transition-colors hover:bg-foreground/15 focus-within:ring-2 focus-within:ring-ring">
                <DropdownMenuTrigger
                  aria-label={`Change start time filter, current value ${formatRange(startTime)}`}
                  className="flex h-full min-w-0 items-center gap-1.5 pl-2.5 outline-none focus-visible:ring-0"
                >
                  <span className="shrink-0 text-muted-foreground">
                    Start time:
                  </span>
                  <span className="truncate">{formatRange(startTime)}</span>
                </DropdownMenuTrigger>
                <button
                  type="button"
                  aria-label="Remove start time filter"
                  onClick={() => setStartTime(null)}
                  className="flex h-full w-7 shrink-0 cursor-pointer items-center justify-center text-muted-foreground outline-none transition-colors hover:text-foreground"
                >
                  <Close aria-hidden="true" size={14} />
                </button>
              </div>
              <DropdownMenuPortal>
                <DropdownMenuPositioner align="start" sideOffset={4}>
                  <DropdownMenuContent className="w-auto min-w-0 overflow-hidden">
                    <StartTimeFilter
                      range={startTime}
                      onApply={applyStartTime}
                      onCancel={() => setStartTimeOpen(false)}
                    />
                  </DropdownMenuContent>
                </DropdownMenuPositioner>
              </DropdownMenuPortal>
            </DropdownMenu>
          )}
          <DropdownMenu open={addOpen} onOpenChange={setAddOpen}>
            <DropdownMenuTrigger
              aria-label="Add filter"
              className={`flex h-8 items-center gap-2 rounded-[2px] bg-foreground/10 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/15 hover:text-foreground ${
                hasFilters ? "w-8 justify-center" : "px-2.5"
              }`}
            >
              {hasFilters ? (
                <Add aria-hidden="true" size={16} />
              ) : (
                <>
                  <Filter aria-hidden="true" size={16} />
                  Filter
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuPositioner align="start" sideOffset={4}>
                <DropdownMenuContent>
                  {filterFields.map((field) => {
                    const options = field.options.filter(
                      (option) =>
                        !filters.some(
                          (filter) =>
                            filter.field === field.id &&
                            filter.value === option.value,
                        ),
                    );
                    return (
                      <DropdownMenuFilter key={field.id}>
                        <DropdownMenuSubmenu>
                          <DropdownMenuSubmenuTrigger className="min-h-8">
                            <span className="flex-1">{field.label}</span>
                            <ChevronRight aria-hidden="true" size={14} />
                          </DropdownMenuSubmenuTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuPositioner
                              side="right"
                              align="start"
                              sideOffset={8}
                            >
                              <DropdownMenuContent className="min-w-72 overflow-hidden">
                                {filterSearch(field.label)}
                                <ScrollArea viewportClassName="max-h-72">
                                  <DropdownMenuList>
                                    {options.map((option) => (
                                      <DropdownMenuItem
                                        key={option.value}
                                        className="min-h-8"
                                        onClick={() =>
                                          addFilter(field.id, option.value)
                                        }
                                      >
                                        <span className="min-w-0 truncate">
                                          {option.label}
                                        </span>
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuList>
                                </ScrollArea>
                                <DropdownMenuEmpty>
                                  No matches.
                                </DropdownMenuEmpty>
                              </DropdownMenuContent>
                            </DropdownMenuPositioner>
                          </DropdownMenuPortal>
                        </DropdownMenuSubmenu>
                      </DropdownMenuFilter>
                    );
                  })}
                  <DropdownMenuSubmenu>
                    <DropdownMenuSubmenuTrigger className="min-h-8">
                      <span className="flex-1">Start time</span>
                      <ChevronRight aria-hidden="true" size={14} />
                    </DropdownMenuSubmenuTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuPositioner
                        side="right"
                        align="start"
                        sideOffset={8}
                      >
                        <DropdownMenuContent className="w-auto min-w-0 overflow-hidden">
                          <StartTimeFilter
                            range={startTime}
                            onApply={applyStartTime}
                            onCancel={() => setAddOpen(false)}
                          />
                        </DropdownMenuContent>
                      </DropdownMenuPositioner>
                    </DropdownMenuPortal>
                  </DropdownMenuSubmenu>
                </DropdownMenuContent>
              </DropdownMenuPositioner>
            </DropdownMenuPortal>
          </DropdownMenu>
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
