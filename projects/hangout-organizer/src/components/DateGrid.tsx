"use client";

import { memo, useCallback, useMemo, useRef } from "react";
import { buildSlotGrid, formatDayHeader } from "@/lib/slots";
import type { SlotGridSpec } from "@/lib/slots";

/**
 * Friend-facing date picker for a date-only poll ("which days suit the trip?").
 *
 * A vertical list rather than the times x days matrix: there is only one slot
 * per day, so a matrix would be a single cramped row, and a list gives each
 * date a tap target big enough for a thumb on a phone.
 */
function DateGridImpl({
  spec,
  selected,
  onChange,
}: {
  spec: SlotGridSpec;
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  // Depends only on which dates were picked, so it survives the parent
  // re-rendering for unrelated reasons (the comment field, the activity tick
  // boxes). Keyed on the windows' CONTENT: the server component builds a fresh
  // array on every render, so its identity changes even when nothing did.
  const windowKey = JSON.stringify(spec.windows);
  const rows = useMemo(() => {
    const { columns } = buildSlotGrid({ ...spec, granularity: "date" });
    return columns.map((column) => ({
      day: column.date,
      key: (column.cells[0] as { start: Date }).start.getTime(),
      ...formatDayHeader(column.date),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey]);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const toggle = useCallback(
    (key: number) => {
      const next = new Set(selectedRef.current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      selectedRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map(({ day, key, weekday, dayOfMonth, month }) => {
        const on = selected.has(key);
        const weekend = weekday === "Sat" || weekday === "Sun";
        return (
          <button
            key={day}
            type="button"
            role="checkbox"
            aria-checked={on}
            aria-label={`${weekday} ${dayOfMonth} ${month}`}
            onClick={() => toggle(key)}
            className={`flex min-h-tap items-center justify-between rounded-xl border px-4 py-3 text-left transition active:scale-[0.99] ${
              on
                ? "border-ok-solid bg-ok-solid text-ok-solid-fg"
                : "border-line-strong bg-surface hover:border-accent"
            }`}
          >
            <span>
              <span className="block text-sm font-medium">
                {weekday} {dayOfMonth} {month}
              </span>
              {weekend && (
                <span className={`block text-xs ${on ? "text-ok-solid-fg/80" : "text-ink-faint"}`}>
                  weekend
                </span>
              )}
            </span>
            <span className="text-xs">{on ? "free" : "tap if free"}</span>
          </button>
        );
      })}
    </div>
  );
}

export const DateGrid = memo(DateGridImpl);
