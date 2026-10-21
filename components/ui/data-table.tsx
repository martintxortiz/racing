"use client";

import { ChevronLeft, ChevronRight } from "@carbon/icons-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  columnFloor,
  fitColumns,
  resizeColumn,
  selectColumnWidth,
  splitColumns,
  type ColumnLayout,
  type SizableColumn,
} from "@/lib/data-table-layout";

export type DataTableColumn<T> = SizableColumn & {
  align?: "start" | "end";
  value: (row: T) => string | number;
  cell: (row: T) => ReactNode;
};

const pageSize = 25;
const pagerButtonClassName =
  "flex size-8 items-center justify-center rounded-[2px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const selectCellStyle = {
  width: selectColumnWidth,
  minWidth: selectColumnWidth,
  maxWidth: selectColumnWidth,
  paddingLeft: 0,
  paddingRight: 0,
};

const readOverrides = (key: string, columns: SizableColumn[]) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const saved: Record<string, number> = {};
    for (const column of columns) {
      const width = (parsed as Record<string, unknown>)[column.id];
      if (typeof width === "number" && Number.isFinite(width)) {
        saved[column.id] = Math.round(width);
      }
    }
    return saved;
  } catch {
    return {};
  }
};

export default function DataTable<T>({
  rows,
  columns,
  getRowId,
  defaultSort,
  onRowClick,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  defaultSort?: {
    columnId: string;
    direction: "descending" | "ascending";
  };
  onRowClick?: (row: T) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState(defaultSort ?? null);
  const [page, setPage] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [basis, setBasis] = useState<ColumnLayout | null>(null);
  const [stored, setStored] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const overridesRef = useRef<Record<string, number>>({});
  const basisRef = useRef<ColumnLayout | null>(null);
  const dragRef = useRef<{
    columnId: string;
    startX: number;
    origin: ColumnLayout;
  } | null>(null);
  const widthsKey = `data-table-widths:v3:${columns.map((column) => column.id).join(",")}`;
  const columnsKey = columns
    .map(
      (column) =>
        `${column.id}:${column.width ?? ""}:${column.fixed ? 1 : 0}:${column.header}`,
    )
    .join("|");

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
  const { fluid, trailing } = splitColumns(columns);
  const layout = basis;

  const applyLayout = (next: ColumnLayout) => {
    basisRef.current = next;
    setBasis(next);
  };

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => {
      const next = Math.floor(element.clientWidth);
      setContainerWidth((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (containerWidth <= 0 || !stored || dragRef.current) return;
    applyLayout(fitColumns(containerWidth, columns, overridesRef.current));
  }, [containerWidth, columns, columnsKey, stored]);

  useEffect(() => {
    overridesRef.current = readOverrides(widthsKey, columns);
    // storage is read after mount so the server render stays empty and matches
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
    setStored(true);
  }, [columns, widthsKey]);

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
  }, [currentPage]);

  const setRowsSelected = (ids: string[], checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });

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

  const commitWidth = (columnId: string, width: number) => {
    overridesRef.current = { ...overridesRef.current, [columnId]: width };
    try {
      localStorage.setItem(widthsKey, JSON.stringify(overridesRef.current));
    } catch {
      // storage unavailable; widths still live in memory
    }
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    const current = basisRef.current;
    if (!drag || !current || containerWidth <= 0) return;
    const width = current.widths[drag.columnId];
    if (width !== drag.origin.widths[drag.columnId])
      commitWidth(drag.columnId, width);
    applyLayout(fitColumns(containerWidth, columns, overridesRef.current));
  };

  const handleResizeMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const column = columns.find((item) => item.id === drag.columnId);
    if (!column) return;
    applyLayout(
      resizeColumn(
        drag.origin,
        column,
        drag.origin.widths[column.id] + event.clientX - drag.startX,
      ),
    );
  };

  const handleResizeKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    column: DataTableColumn<T>,
  ) => {
    const current = basisRef.current;
    if (!current || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
      return;
    }
    event.preventDefault();
    const next = resizeColumn(
      current,
      column,
      current.widths[column.id] + (event.key === "ArrowRight" ? 16 : -16),
    );
    applyLayout(next);
    commitWidth(column.id, next.widths[column.id]);
  };

  const renderHeader = (column: DataTableColumn<T>) => {
    if (column.fixed && column.align === "end") {
      return <span className="sr-only">{column.header || "Actions"}</span>;
    }
    return (
      <button
        type="button"
        onClick={() => toggleSort(column.id)}
        className="flex w-full min-w-0 items-center gap-1 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">{column.header}</span>
        {sort?.columnId === column.id && (
          <span aria-hidden="true" className="shrink-0">
            {sort.direction === "descending" ? "↓" : "↑"}
          </span>
        )}
      </button>
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
              setRowsSelected(pageRows.map(getRowId), checked)
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
              className={pagerButtonClassName}
            >
              <ChevronLeft aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
              className={pagerButtonClassName}
            >
              <ChevronRight aria-hidden="true" size={16} />
            </button>
          </div>
        </div>
      </div>
      <ScrollArea viewportRef={viewportRef} className="min-h-0 flex-1">
        {!(layout && containerWidth > 0) ? (
          <div
            role="status"
            aria-label="Loading table"
            className="flex h-full min-h-40 items-center justify-center text-muted-foreground"
          >
            <Spinner />
            <span className="sr-only">Loading table…</span>
          </div>
        ) : (
          <Table
            className="table-fixed"
            style={{
              width: containerWidth,
              minWidth: containerWidth,
              maxWidth: containerWidth,
            }}
          >
            <colgroup>
              <col style={{ width: selectColumnWidth }} />
              {fluid.map((column) => (
                <col
                  key={column.id}
                  style={{ width: layout.widths[column.id] }}
                />
              ))}
              <col style={{ width: layout.spacer }} />
              {trailing.map((column) => (
                <col
                  key={column.id}
                  style={{ width: layout.widths[column.id] }}
                />
              ))}
            </colgroup>
            <TableHeader className="sticky top-0 z-20 bg-muted">
              <TableRow className="h-7">
                <TableHead
                  className="sticky start-0 top-0 z-30 h-7 bg-muted p-0"
                  style={selectCellStyle}
                >
                  <span className="sr-only">Select</span>
                </TableHead>
                {fluid.map((column, index) => (
                  <TableHead
                    key={column.id}
                    className="relative h-7 bg-muted p-0 text-xs font-medium"
                    style={{
                      width: layout.widths[column.id],
                      paddingLeft: 0,
                      paddingRight: 0,
                    }}
                    aria-sort={
                      sort?.columnId === column.id ? sort.direction : "none"
                    }
                  >
                    <div className="overflow-hidden px-3">
                      {renderHeader(column)}
                    </div>
                    {!column.fixed && index < fluid.length - 1 && (
                      <div
                        role="separator"
                        aria-label={`Resize ${column.header} column`}
                        aria-orientation="vertical"
                        aria-valuemin={columnFloor(column.header)}
                        aria-valuemax={layout.widths[column.id] + layout.spacer}
                        aria-valuenow={layout.widths[column.id]}
                        tabIndex={0}
                        title="Drag to resize"
                        className="absolute inset-y-0 -right-3 z-10 w-6 touch-none cursor-col-resize after:absolute after:inset-y-1.5 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-foreground/10 after:transition-colors hover:after:bg-brand focus-visible:outline-none focus-visible:after:bg-brand"
                        onPointerDown={(event) => {
                          if (!basisRef.current) return;
                          dragRef.current = {
                            columnId: column.id,
                            startX: event.clientX,
                            origin: basisRef.current,
                          };
                          event.preventDefault();
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                        }}
                        onPointerMove={handleResizeMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onKeyDown={(event) =>
                          handleResizeKeyDown(event, column)
                        }
                      />
                    )}
                  </TableHead>
                ))}
                <TableHead
                  aria-hidden="true"
                  className="p-0"
                  style={{ width: layout.spacer, padding: 0 }}
                />
                {trailing.map((column) => (
                  <TableHead
                    key={column.id}
                    className="relative h-7 bg-muted p-0 text-xs font-medium"
                    style={{
                      width: layout.widths[column.id],
                      paddingLeft: 0,
                      paddingRight: 0,
                    }}
                  >
                    <div
                      className={
                        column.align === "end"
                          ? "overflow-hidden px-3 text-end"
                          : "overflow-hidden px-3"
                      }
                    >
                      {renderHeader(column)}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  className={`group h-10 hover:bg-muted/50 ${onRowClick ? "cursor-pointer" : ""}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  <TableCell
                    className="sticky start-0 z-10 bg-card p-0 group-hover:bg-muted/50"
                    style={selectCellStyle}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center justify-center">
                      <Checkbox
                        aria-label={`Select ${getRowId(row)}`}
                        checked={selected.has(getRowId(row))}
                        onCheckedChange={(checked) =>
                          setRowsSelected([getRowId(row)], checked)
                        }
                      />
                    </div>
                  </TableCell>
                  {fluid.map((column) => (
                    <TableCell
                      key={column.id}
                      className="overflow-hidden p-0 py-1 leading-4"
                      style={{
                        width: layout.widths[column.id],
                        paddingLeft: 0,
                        paddingRight: 0,
                      }}
                    >
                      <div className="min-w-0 px-3">{column.cell(row)}</div>
                    </TableCell>
                  ))}
                  <TableCell
                    aria-hidden="true"
                    className="p-0"
                    style={{ width: layout.spacer, padding: 0 }}
                  />
                  {trailing.map((column) => (
                    <TableCell
                      key={column.id}
                      className="overflow-hidden p-0 py-1 leading-4"
                      style={{
                        width: layout.widths[column.id],
                        paddingLeft: 0,
                        paddingRight: 0,
                      }}
                    >
                      <div
                        className={
                          column.align === "end"
                            ? "flex items-center justify-end px-3"
                            : "min-w-0 px-3"
                        }
                      >
                        {column.cell(row)}
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
    </>
  );
}
