export type DateRange = { from: number; to: number };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const presets = [
  { id: "4h", label: "Last 4 hours" },
  { id: "24h", label: "Last 24 hours" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "3m", label: "Last 3 months" },
  { id: "6m", label: "Last 6 months" },
  { id: "1y", label: "Last year" },
] as const;

export type PresetId = (typeof presets)[number]["id"];

export const presetRange = (id: PresetId, now = new Date()): DateRange => {
  const to = now.getTime();
  if (id === "4h") return { from: to - 4 * HOUR, to };
  if (id === "24h") return { from: to - DAY, to };
  if (id === "7d") return { from: to - 7 * DAY, to };
  if (id === "30d") return { from: to - 30 * DAY, to };
  const months = id === "3m" ? 3 : id === "6m" ? 6 : 12;
  const from = new Date(now);
  from.setMonth(from.getMonth() - months);
  return { from: from.getTime(), to };
};

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export const endOfDay = (date: Date) =>
  new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();

export const monthCells = (date: Date): Date[] => {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = new Date(
    first.getFullYear(),
    first.getMonth(),
    1 - first.getDay(),
  );
  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
  );
};

const pad = (value: number) => String(value).padStart(2, "0");

export const dateInputValue = (ms: number) => {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const timeInputValue = (ms: number) => {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const mergeDate = (ms: number | null, value: string) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  const time = ms === null ? new Date(0, 0, 1, 0, 0) : new Date(ms);
  return new Date(
    year,
    month - 1,
    day,
    time.getHours(),
    time.getMinutes(),
  ).getTime();
};

export const mergeTime = (ms: number | null, value: string) => {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  const date = ms === null ? new Date() : new Date(ms);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
  ).getTime();
};

export const formatRange = ({ from, to }: DateRange) => {
  const format = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const start = format(from);
  const end = format(to);
  return start === end ? start : `${start} – ${end}`;
};

export const monthLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "long", year: "numeric" });

export const matchesRange = (range: DateRange | null, dateStart: string) => {
  if (!range) return true;
  const time = Date.parse(dateStart);
  return time >= range.from && time <= range.to;
};
