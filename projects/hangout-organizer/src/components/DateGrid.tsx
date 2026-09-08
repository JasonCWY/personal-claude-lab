"use client";

import { buildSlotGrid, formatDayHeader } from "@/lib/slots";

/**
 * Friend-facing date picker for a date-only poll ("which days suit the trip?").
 *
 * A vertical list rather than the times x days matrix: there is only one slot
 * per day, so a matrix would be a single cramped row, and a list gives each
 * date a tap target big enough for a thumb on a phone.
 */
export function DateGrid({
  spec,
  selected,
  onChange,
}: {
  spec: {
    pollStartDate: string;
    pollEndDate: string;
    granularity?: "time" | "date";
    dayStartTime: string;
    dayEndTime: string;
    slotMinutes: number;
  };
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const { days, grid } = buildSlotGrid({ ...spec, granularity: "date" });

  function toggle(key: number) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {days.map((day, i) => {
        const key = grid[0][i].getTime();
        const on = selected.has(key);
        const { weekday, dayOfMonth, month } = formatDayHeader(day);
        const weekend = weekday === "Sat" || weekday === "Sun";
        return (
          <button
            key={day}
            type="button"
            role="checkbox"
            aria-checked={on}
            aria-label={`${weekday} ${dayOfMonth} ${month}`}
            onClick={() => toggle(key)}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
              on
                ? "border-emerald-600 bg-emerald-500 text-white"
                : "border-slate-300 bg-white hover:border-slate-500"
            }`}
          >
            <span>
              <span className="block text-sm font-medium">
                {weekday} {dayOfMonth} {month}
              </span>
              {weekend && (
                <span
                  className={`block text-xs ${on ? "text-emerald-50" : "text-slate-400"}`}
                >
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
