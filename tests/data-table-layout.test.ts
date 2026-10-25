import { describe, expect, it } from "vitest";

import {
  columnFloor,
  fitColumns,
  resizeColumn,
  selectColumnWidth,
  type SizableColumn,
} from "../lib/data-table-layout";

const columns: SizableColumn[] = [
  { id: "name", header: "Name", width: 360 },
  { id: "start", header: "Start time", width: 144 },
  { id: "imported", header: "Imported At", width: 160 },
  { id: "event", header: "Event", width: 240 },
  { id: "actions", header: "Actions", width: 56, fixed: true },
];

const occupied = (layout: ReturnType<typeof fitColumns>) =>
  selectColumnWidth +
  columns.reduce((total, column) => total + layout.widths[column.id], 0) +
  layout.spacer;

const events: SizableColumn[] = [
  { id: "name", header: "Name", width: 240 },
  { id: "start", header: "Start time", width: 144 },
  { id: "sessions", header: "Sessions", width: 96 },
  { id: "track", header: "Track", width: 200 },
  { id: "actions", header: "Actions", width: 56, fixed: true },
];

describe("fitColumns", () => {
  it("spreads an untouched table across the container", () => {
    const layout = fitColumns(1400, columns, {});
    expect(layout.widths).toMatchObject({
      name: 519,
      start: 207,
      imported: 230,
      event: 348,
      actions: 56,
    });
    expect(layout.spacer).toBe(0);
    expect(occupied(layout)).toBe(1400);
  });

  it("spreads the narrower events columns instead of leaving them on the left", () => {
    const layout = fitColumns(1400, events, {});
    const width =
      selectColumnWidth +
      events.reduce((total, column) => total + layout.widths[column.id], 0) +
      layout.spacer;
    expect(layout.spacer).toBe(0);
    expect(layout.widths.actions).toBe(56);
    expect(layout.widths.sessions).toBeGreaterThan(96);
    expect(layout.widths.name).toBeGreaterThan(layout.widths.sessions);
    expect(width).toBe(1400);
  });

  it("keeps a saved column width and spreads the rest", () => {
    const layout = fitColumns(1400, columns, { start: 200 });
    expect(layout.widths.start).toBe(200);
    expect(layout.widths.name).toBeGreaterThan(360);
    expect(layout.widths.event).toBeGreaterThan(240);
    expect(layout.widths.actions).toBe(56);
    expect(layout.spacer).toBe(0);
    expect(occupied(layout)).toBe(1400);
  });

  it("shrinks toward the header floor when the container is tighter than the designed widths", () => {
    const layout = fitColumns(700, columns, {});
    expect(occupied(layout)).toBe(700);
    expect(layout.widths.actions).toBe(56);
    expect(layout.widths.name).toBeGreaterThanOrEqual(columnFloor("Name"));
    expect(layout.widths.imported).toBeGreaterThanOrEqual(
      columnFloor("Imported At"),
    );
    expect(layout.spacer).toBe(0);
  });
});

describe("resizeColumn", () => {
  const initial = {
    widths: {
      name: 360,
      start: 144,
      imported: 160,
      event: 240,
      actions: 56,
    },
    spacer: 400,
  };

  it("changes only the dragged column and the spacer", () => {
    const start = columns[1];
    const next = resizeColumn(initial, start, initial.widths.start + 80);
    expect(next.widths.start).toBe(initial.widths.start + 80);
    expect(next.widths.name).toBe(initial.widths.name);
    expect(next.widths.imported).toBe(initial.widths.imported);
    expect(next.widths.event).toBe(initial.widths.event);
    expect(next.widths.actions).toBe(56);
    expect(next.spacer).toBe(initial.spacer - 80);
    expect(occupied(next)).toBe(1400);
  });

  it("stops at the spacer instead of taking width from the next column", () => {
    const start = columns[1];
    const next = resizeColumn(initial, start, 10_000);
    expect(next.widths.start).toBe(initial.widths.start + initial.spacer);
    expect(next.widths.event).toBe(initial.widths.event);
    expect(next.spacer).toBe(0);
  });

  it("stops at the header floor", () => {
    const start = columns[1];
    const next = resizeColumn(initial, start, 1);
    expect(next.widths.start).toBe(columnFloor("Start time"));
    expect(next.widths.name).toBe(initial.widths.name);
    expect(next.spacer).toBeGreaterThan(initial.spacer);
  });

  it("does not resize a fixed column", () => {
    const next = resizeColumn(initial, columns[4], 200);
    expect(next).toBe(initial);
  });
});
