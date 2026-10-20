"use client";

import { ChevronLeft, ChevronRight } from "@carbon/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  dateInputValue,
  endOfDay,
  mergeDate,
  mergeTime,
  monthCells,
  monthLabel,
  presetRange,
  presets,
  startOfDay,
  timeInputValue,
  type DateRange,
  type PresetId,
} from "@/lib/date-range";
import { cn } from "@/lib/utils";

const weekdays = ["S", "M", "T", "W", "T", "F", "S"];

const fieldClassName =
  "h-8 min-w-0 rounded-[2px] bg-foreground/10 px-2 text-sm text-foreground outline-none transition-colors [color-scheme:light] hover:bg-foreground/15 focus-visible:ring-2 focus-visible:ring-ring dark:[color-scheme:dark]";

const iconButtonClassName =
  "flex size-7 items-center justify-center rounded-[2px] text-muted-foreground outline-none transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

const presetClassName =
  "h-8 shrink-0 rounded-[2px] px-2 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export default function StartTimeFilter({
  range,
  onApply,
  onCancel,
}: {
  range: DateRange | null;
  onApply: (range: DateRange | null) => void;
  onCancel: () => void;
}) {
  const [from, setFrom] = useState<number | null>(range?.from ?? null);
  const [to, setTo] = useState<number | null>(range?.to ?? null);
  const [month, setMonth] = useState(() => {
    const base = new Date(range?.from ?? Date.now());
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const showMonth = (ms: number) => {
    const base = new Date(ms);
    setMonth(new Date(base.getFullYear(), base.getMonth(), 1));
  };

  const stepMonth = (offset: number) =>
    setMonth((current) => {
      const next = new Date(current);
      next.setMonth(next.getMonth() + offset);
      return next;
    });

  const pickPreset = (id: PresetId) => {
    const next = presetRange(id);
    setFrom(next.from);
    setTo(next.to);
    showMonth(next.from);
  };

  const pickDay = (day: Date) => {
    const start = startOfDay(day);
    if (from === null || to !== null || start < from) {
      setFrom(start);
      setTo(null);
      return;
    }
    setTo(endOfDay(day));
  };

  const fromDay = from === null ? null : startOfDay(new Date(from));
  const toDay = to === null ? null : startOfDay(new Date(to));
  const complete = from !== null && to !== null && from <= to;

  return (
    <div className="flex w-[438px] flex-col gap-3 p-3">
      <div className="flex gap-3">
        <div className="flex w-32 shrink-0 flex-col gap-0.5">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={presetClassName}
              onClick={() => pickPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            className={presetClassName}
            onClick={() => onApply(null)}
          >
            All time
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              className={iconButtonClassName}
              onClick={() => stepMonth(-1)}
            >
              <ChevronLeft aria-hidden="true" size={16} />
            </button>
            <span className="text-sm font-medium">{monthLabel(month)}</span>
            <button
              type="button"
              aria-label="Next month"
              className={iconButtonClassName}
              onClick={() => stepMonth(1)}
            >
              <ChevronRight aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground">
            {weekdays.map((weekday, index) => (
              <span key={index}>{weekday}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {monthCells(month).map((day) => {
              const dayStart = startOfDay(day);
              const isEdge = dayStart === fromDay || dayStart === toDay;
              const inRange =
                fromDay !== null &&
                toDay !== null &&
                dayStart >= fromDay &&
                dayStart <= toDay;
              const outside = day.getMonth() !== month.getMonth();
              return (
                <button
                  key={dayStart}
                  type="button"
                  aria-label={day.toLocaleDateString(undefined, {
                    dateStyle: "long",
                  })}
                  aria-pressed={isEdge}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-[2px] text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    isEdge
                      ? "bg-brand text-white"
                      : inRange
                        ? "bg-brand/25 text-foreground"
                        : "hover:bg-foreground/10",
                    !isEdge && !inRange && "text-muted-foreground",
                    outside &&
                      !isEdge &&
                      !inRange &&
                      "text-muted-foreground/40",
                  )}
                  onClick={() => pickDay(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-9 shrink-0 text-xs text-muted-foreground">
          Start
        </span>
        <input
          type="date"
          aria-label="Start date"
          className={cn(fieldClassName, "flex-1")}
          value={from === null ? "" : dateInputValue(from)}
          onChange={(event) => setFrom(mergeDate(from, event.target.value))}
        />
        <input
          type="time"
          aria-label="Start time"
          className={cn(fieldClassName, "w-28 shrink-0")}
          value={from === null ? "" : timeInputValue(from)}
          onChange={(event) => setFrom(mergeTime(from, event.target.value))}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-9 shrink-0 text-xs text-muted-foreground">End</span>
        <input
          type="date"
          aria-label="End date"
          className={cn(fieldClassName, "flex-1")}
          value={to === null ? "" : dateInputValue(to)}
          onChange={(event) => setTo(mergeDate(to, event.target.value))}
        />
        <input
          type="time"
          aria-label="End time"
          className={cn(fieldClassName, "w-28 shrink-0")}
          value={to === null ? "" : timeInputValue(to)}
          onChange={(event) => setTo(mergeTime(to, event.target.value))}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="card"
          className="w-full"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="w-full"
          disabled={!complete}
          onClick={() => complete && onApply({ from, to })}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
