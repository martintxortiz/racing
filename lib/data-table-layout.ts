export const selectColumnWidth = 40;

export type SizableColumn = {
  id: string;
  header: string;
  width?: number;
  fixed?: boolean;
};

export type ColumnLayout = {
  widths: Record<string, number>;
  spacer: number;
};

const defaultColumnWidth = 160;
const headerAdvance = 6.5;
const headerChrome = 36;

export const columnFloor = (header: string) =>
  Math.max(48, Math.ceil(header.length * headerAdvance + headerChrome));

const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);

export const splitColumns = <T extends SizableColumn>(columns: T[]) => {
  let trailing = 0;
  while (
    trailing < columns.length &&
    columns[columns.length - 1 - trailing]?.fixed
  ) {
    trailing += 1;
  }
  return {
    fluid: columns.slice(0, columns.length - trailing),
    trailing: columns.slice(columns.length - trailing),
  };
};

const fill = (assigned: number[], flexible: boolean[], available: number) => {
  const locked = sum(assigned.filter((_, index) => !flexible[index]));
  const room = available - locked;
  const base = assigned.map((width, index) => (flexible[index] ? width : 0));
  const baseSum = sum(base);
  if (baseSum <= 0 || room <= baseSum) return assigned;
  const scaled = base.map((width) => Math.floor((width * room) / baseSum));
  let extra = room - sum(scaled);
  for (let index = scaled.length - 1; index >= 0 && extra > 0; index -= 1) {
    if (!flexible[index]) continue;
    scaled[index] += extra;
    extra = 0;
  }
  return assigned.map((width, index) =>
    flexible[index] ? scaled[index] : width,
  );
};

const scaleTo = (assigned: number[], floors: number[], available: number) => {
  const floorSum = sum(floors);
  if (floorSum >= available) {
    // shortcut: columns scale below the header floor when the container is narrower than that sum, switch to horizontal scroll if a dense table must keep every header fully visible
    if (available <= 0 || floorSum === 0) return assigned.map(() => 0);
    const scaled = floors.map((floor) =>
      Math.floor((floor * available) / floorSum),
    );
    scaled[scaled.length - 1] += available - sum(scaled);
    return scaled;
  }

  const next = assigned.slice();
  const excess = sum(next) - available;
  const slack = next.map((width, index) => width - floors[index]);
  const slackSum = sum(slack);
  let removed = 0;
  for (let index = 0; index < next.length; index += 1) {
    const cut = Math.min(
      slack[index],
      Math.floor((slack[index] / slackSum) * excess),
    );
    next[index] -= cut;
    removed += cut;
  }
  let leftover = excess - removed;
  for (let index = 0; index < next.length && leftover > 0; index += 1) {
    const cut = Math.min(leftover, next[index] - floors[index]);
    next[index] -= cut;
    leftover -= cut;
  }
  return next;
};

export const fitColumns = (
  containerWidth: number,
  columns: SizableColumn[],
  overrides: Record<string, number>,
): ColumnLayout => {
  const { fluid, trailing } = splitColumns(columns);
  const trailingWidths = trailing.map(
    (column) => column.width ?? defaultColumnWidth,
  );
  const available = Math.max(
    0,
    containerWidth - selectColumnWidth - sum(trailingWidths),
  );
  const floors = fluid.map((column) =>
    column.fixed
      ? (column.width ?? defaultColumnWidth)
      : columnFloor(column.header),
  );
  let assigned = fluid.map((column, index) => {
    if (column.fixed) return column.width ?? defaultColumnWidth;
    const wanted = overrides[column.id] ?? column.width ?? defaultColumnWidth;
    return Math.max(floors[index], Math.round(wanted));
  });
  // overridden columns keep their width; everything else absorbs leftover space
  const flexible = fluid.map(
    (column) => !column.fixed && overrides[column.id] === undefined,
  );
  if (sum(assigned) > available)
    assigned = scaleTo(assigned, floors, available);
  else assigned = fill(assigned, flexible, available);

  const widths: Record<string, number> = {};
  fluid.forEach((column, index) => {
    widths[column.id] = assigned[index];
  });
  trailing.forEach((column, index) => {
    widths[column.id] = trailingWidths[index];
  });
  return { widths, spacer: available - sum(assigned) };
};

export const resizeColumn = (
  layout: ColumnLayout,
  column: SizableColumn,
  nextWidth: number,
): ColumnLayout => {
  if (column.fixed) return layout;
  const current = layout.widths[column.id];
  const width = Math.round(
    Math.min(
      current + layout.spacer,
      Math.max(columnFloor(column.header), nextWidth),
    ),
  );
  return {
    widths: { ...layout.widths, [column.id]: width },
    spacer: layout.spacer - (width - current),
  };
};
