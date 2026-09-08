"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildSlotGrid, formatDayHeader, formatSlotRange } from "@/lib/slots";

interface Props {
  spec: {
    pollStartDate: string;
    pollEndDate: string;
    dayStartTime: string;
    dayEndTime: string;
    slotMinutes: number;
  };
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}

/**
 * Friend-facing drag-to-select grid.
 *
 * Touch is the primary target — most people open this from WhatsApp on a phone.
 * Two consequences shape the implementation:
 *  - `touch-action: none` on cells, so dragging paints instead of scrolling the page.
 *  - Pointer events are tracked on the container with elementFromPoint rather than
 *    per-cell enter handlers, because touch pointers do not fire enter/leave on the
 *    elements they pass over the way a mouse does.
 */
export function AvailabilityGrid({ spec, selected, onChange }: Props) {
  const { days, times, grid } = buildSlotGrid(spec);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // Whether this drag is painting slots on or wiping them off — decided by the
  // state of the first cell touched, which is what makes a second pass erase.
  const paintOn = useRef(true);

  const apply = useCallback(
    (key: number) => {
      const next = new Set(selected);
      if (paintOn.current) next.add(key);
      else next.delete(key);
      onChange(next);
    },
    [selected, onChange],
  );

  const keyAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y);
    const raw = el?.getAttribute?.("data-slot");
    return raw ? Number(raw) : null;
  };

  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging]);

  return (
    <div className="overflow-x-auto">
      <div
        ref={containerRef}
        onPointerMove={(e) => {
          if (!dragging) return;
          const key = keyAt(e.clientX, e.clientY);
          if (key != null) apply(key);
        }}
      >
        <table className="min-w-full border-separate border-spacing-0.5 text-center text-xs select-none">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-1 py-1" />
              {days.map((day, i) => {
                const { weekday, dayOfMonth, month } = formatDayHeader(day);
                // Repeat the month only when it changes, so a poll crossing
                // September into October says so exactly where it matters.
                const showMonth = i === 0 || formatDayHeader(days[i - 1]).month !== month;
                return (
                  <th key={day} className="px-1 py-1 font-medium text-slate-600">
                    <div className="text-[0.7rem] uppercase tracking-wide text-slate-400">
                      {weekday}
                    </div>
                    <div className="text-sm font-semibold text-slate-700">{dayOfMonth}</div>
                    <div
                      className={`text-[0.65rem] ${
                        showMonth ? "text-slate-500" : "text-transparent"
                      }`}
                    >
                      {month}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {times.map((time, ti) => (
              <tr key={time}>
                <th className="sticky left-0 z-10 whitespace-nowrap bg-slate-50 px-2 py-1 text-right font-normal tabular-nums text-slate-500">
                  <span className="text-[0.7rem]">
                    {formatSlotRange(time, spec.slotMinutes)}
                  </span>
                </th>
                {days.map((day, di) => {
                  const key = grid[ti][di].getTime();
                  const on = selected.has(key);
                  return (
                    <td key={day} className="p-0">
                      <div
                        data-slot={key}
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`${day} ${formatSlotRange(time, spec.slotMinutes)}`}
                        tabIndex={0}
                        style={{ touchAction: "none" }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          paintOn.current = !on;
                          setDragging(true);
                          apply(key);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") {
                            e.preventDefault();
                            paintOn.current = !on;
                            apply(key);
                          }
                        }}
                        className={`h-9 min-w-[2.75rem] cursor-pointer rounded transition-colors ${
                          on ? "bg-emerald-500" : "bg-slate-200 hover:bg-slate-300"
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
