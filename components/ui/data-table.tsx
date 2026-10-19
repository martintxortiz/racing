"use client";

import { ChevronLeft, ChevronRight } from "@carbon/icons-react";
import {
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

export type DataTableColumn<T> = {
  id: string;
  header: string;
  width?: number;
  value: (row: T) => string | number;
  cell: (row: T) => ReactNode;
};

const pageSize = 25;
const minimumColumnWidth = 56;

export default function DataTable<T>({
  rows,
  columns,
  getRowId,
  defaultSort,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  defaultSort?: {
    columnId: string;
    direction: "descending" | "ascending";
  };
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState(defaultSort ?? null);
  const [page, setPage] = useState(0);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const sortColumn = columns.find((column) => column.id === sort?.columnId);
  const sortedRows = useMemo(
    () =>
      sortColumn
        ? [...rows].sort((left, right) => {
            const a = sortColumn.value(left);
            const b = sortColumn.value(right);
            const order =
              typeof a === "number" && typeof b === "number"
                ? a - b
                : String(a).localeCompare(String(b), undefined, {
                    numeric: true,
                    sensitivity: "base",
                  });
            return sort?.direction === "ascending" ? order : -order;
          })
        : rows,
    [rows, sort?.direction, sortColumn],
  );
  const pageCount = Math.ceil(rows.length / pageSize);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const pageRows = sortedRows.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const selectedOnPage = pageRows.filter((row) =>
    selected.has(getRowId(row)),
  ).length;
  const allSelected = pageRows.length > 0 && selectedOnPage === pageRows.length;

  const toggleSort = (columnId: string) => {
    setPage(0);
    setSort((current) =>
      current?.columnId !== columnId
        ? { columnId, direction: "descending" }
        : current.direction === "descending"
          ? { columnId, direction: "ascending" }
          : null,
    );
  };

  const resizeColumn = (columnId: string, width: number) =>
    setWidths((current) => ({
      ...current,
      [columnId]: Math.max(minimumColumnWidth, width),
    }));

  const handleResizeMove = (event: PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    const startX = Number(handle.dataset.startX);
    const startWidth = Number(handle.dataset.startWidth);
    if (handle.hasPointerCapture(event.pointerId)) {
      resizeColumn(
        handle.dataset.columnId!,
        startWidth + event.clientX - startX,
      );
    }
  };

  const handleResizeKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    columnId: string,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    resizeColumn(
      columnId,
      (widths[columnId] ??
        event.currentTarget.parentElement?.getBoundingClientRect().width ??
        minimumColumnWidth) + (event.key === "ArrowRight" ? 16 : -16),
    );
  };

  return (
    <>
      <div className="flex h-10 items-center justify-between border-b border-border/60 px-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Checkbox
            aria-label="Select all items"
            checked={allSelected}
            indeterminate={selectedOnPage > 0 && !allSelected}
            onCheckedChange={(checked) =>
              setSelected((current) => {
                const next = new Set(current);
                pageRows.forEach((row) => {
                  if (checked) next.add(getRowId(row));
                  else next.delete(getRowId(row));
                });
                return next;
              })
            }
          />
          <span>{selected.size} selected</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>{rows.length} items</span>
          <span aria-live="polite" aria-atomic="true">
            {rows.length === 0
              ? "0 of 0"
              : `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, rows.length)} of ${rows.length}`}
          </span>
          <div className="ml-1 flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous page"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className="flex size-8 items-center justify-center rounded-[2px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
              className="flex size-8 items-center justify-center rounded-[2px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight aria-hidden="true" size={16} />
            </button>
          </div>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <Table className="min-w-[720px] table-fixed" style={{ width: "100%" }}>
          <colgroup>
            <col style={{ width: 40 }} />
            {columns.map((column) => (
              <col
                key={column.id}
                style={
                  widths[column.id]
                    ? { width: widths[column.id] }
                    : column.width
                      ? { width: column.width }
                      : undefined
                }
              />
            ))}
          </colgroup>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow className="h-7">
              <TableHead className="sticky start-0 z-20 h-7 w-10 min-w-10 max-w-10 bg-muted">
                <span className="sr-only">Select</span>
              </TableHead>
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className="group relative h-7 bg-muted text-xs font-medium"
                  aria-sort={
                    sort?.columnId === column.id ? sort.direction : "none"
                  }
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.id)}
                    className="inline-flex items-center gap-1 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {column.header}
                    {sort?.columnId === column.id && (
                      <span aria-hidden="true">
                        {sort.direction === "descending" ? "↓" : "↑"}
                      </span>
                    )}
                  </button>
                  <div
                    role="separator"
                    aria-label={`Resize ${column.header} column`}
                    aria-orientation="vertical"
                    aria-valuemin={minimumColumnWidth}
                    aria-valuenow={widths[column.id]}
                    tabIndex={0}
                    data-column-id={column.id}
                    className="absolute inset-y-0 right-0 z-10 w-3 touch-none cursor-col-resize after:absolute after:inset-y-1 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border after:opacity-0 group-hover:after:opacity-100 hover:after:bg-brand focus-visible:outline-none focus-visible:after:bg-brand focus-visible:after:opacity-100"
                    onPointerDown={(event) => {
                      event.currentTarget.dataset.startX = String(
                        event.clientX,
                      );
                      event.currentTarget.dataset.startWidth = String(
                        event.currentTarget.parentElement?.getBoundingClientRect()
                          .width ?? minimumColumnWidth,
                      );
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={handleResizeMove}
                    onKeyDown={(event) => handleResizeKeyDown(event, column.id)}
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow
                key={getRowId(row)}
                className="group h-10 hover:bg-muted/50"
              >
                <TableCell className="sticky start-0 z-10 w-10 min-w-10 max-w-10 bg-card group-hover:bg-muted/50">
                  <Checkbox
                    aria-label={`Select ${getRowId(row)}`}
                    checked={selected.has(getRowId(row))}
                    onCheckedChange={(checked) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (checked) next.add(getRowId(row));
                        else next.delete(getRowId(row));
                        return next;
                      })
                    }
                  />
                </TableCell>
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className="overflow-hidden py-1 leading-4"
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </>
  );
}
