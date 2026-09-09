"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 *
 * Everything below the pointer handler exists to keep a drag cheap. A pointer
 * fires move events far faster than this grid can usefully repaint, and each one
 * used to allocate a fresh Set and re-render every cell in the table — including
 * while the finger sat still, and including while it crossed cells that were
 * already the colour being painted. On a phone that is exactly the "drag lags
 * behind my finger" symptom. Now a move reaches React only when it lands on a
 * different cell AND that cell is about to change.
 */
function AvailabilityGridImpl({ spec, selected, onChange }: Props) {
  // Rebuilding the grid means allocating a Date per cell. It depends only on
  // the poll's shape, which never changes while the page is open, so it must
  // not be recomputed every time the parent re-renders — a keystroke in the
  // comment box below used to be enough to trigger that.
  const { days, times, grid } = useMemo(
    () => buildSlotGrid(spec),
    [spec.pollStartDate, spec.pollEndDate, spec.dayStartTime, spec.dayEndTime, spec.slotMinutes],
  );

  // Header strings are pure functions of the grid, so derive them once.
  const dayHeaders = useMemo(
    () =>
      days.map((day, i) => {
        const parts = formatDayHeader(day);
        return {
          ...parts,
          // Repeat the month only when it changes, so a poll crossing
          // September into October says so exactly where it matters.
          showMonth: i === 0 || formatDayHeader(days[i - 1]).month !== parts.month,
        };
      }),
    [days],
  );
  const timeLabels = useMemo(
    () => times.map((time) => formatSlotRange(time, spec.slotMinutes)),
    [times, spec.slotMinutes],
  );

  const [dragging, setDragging] = useState(false);
  // Whether this drag is painting slots on or wiping them off — decided by the
  // state of the first cell touched, which is what makes a second pass erase.
  const paintOn = useRef(true);
  // The last cell a move event resolved to, so sliding within one cell is free.
  const lastKey = useRef<number | null>(null);

  // Read the live selection through a ref so `apply` never has to be rebuilt,
  // and so a burst of moves within one frame all see the latest set.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const apply = useCallback(
    (key: number) => {
      const current = selectedRef.current;
      // Already the colour being painted — nothing would change, so don't
      // allocate a Set and don't wake React.
      if (paintOn.current ? current.has(key) : !current.has(key)) return;
      const next = new Set(current);
      if (paintOn.current) next.add(key);
      else next.delete(key);
      selectedRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  const keyAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y);
    const raw = el?.getAttribute?.("data-slot");
    return raw ? Number(raw) : null;
  };

  useEffect(() => {
    if (!dragging) return;
    const stop = () => {
      setDragging(false);
      lastKey.current = null;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      // elementFromPoint is a hit test, so it forces the browser to flush
      // pending layout. Guarding on the resolved cell afterwards is what stops
      // the repaint; the hit test itself is unavoidable to know where we are.
      const key = keyAt(e.clientX, e.clientY);
      if (key == null || key === lastKey.current) return;
      lastKey.current = key;
      apply(key);
    },
    [dragging, apply],
  );

  return (
    <div className="overflow-x-auto">
      <div onPointerMove={onPointerMove}>
        <table className="min-w-full border-separate border-spacing-0.5 text-center text-xs select-none">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-1 py-1" />
              {days.map((day, i) => {
                const { weekday, dayOfMonth, month, showMonth } = dayHeaders[i];
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
                  <span className="text-[0.7rem]">{timeLabels[ti]}</span>
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
                        aria-label={`${day} ${timeLabels[ti]}`}
                        tabIndex={0}
                        style={{ touchAction: "none" }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          paintOn.current = !on;
                          lastKey.current = key;
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

/**
 * Memoised because the parent owns unrelated state — the comment field, the
 * activity tick boxes — and a keystroke in any of it would otherwise re-render
 * every cell of the grid.
 */
export const AvailabilityGrid = memo(AvailabilityGridImpl);
