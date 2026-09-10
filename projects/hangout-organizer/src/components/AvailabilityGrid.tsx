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
    <div className="-mx-1 scroll-x px-1">
      <div onPointerMove={onPointerMove}>
        <table className="min-w-full border-separate border-spacing-0.5 select-none text-center text-xs">
          {/*
            No `sticky top-0` on this row, deliberately. The wrapper sets
            overflow-x, which per spec makes it a scroll container on BOTH axes,
            so a vertical sticky offset would resolve against a box that never
            scrolls vertically and simply never fire. Pinning the day names
            would mean giving the grid its own capped height and a nested
            scroll area, which is worse on a phone than losing the header.
          */}
          <thead>
            <tr>
            {/*
              `w-px` on the label column, not a width: a table cell cannot go
              below its content, so this collapses the column to exactly the
              width of "14:00–15:00" and hands every remaining pixel to the day
              columns. Without it the spare width landed on the labels — on a
              390px phone that was 235px of text against a 117px tap target,
              which is the wrong way round for the column you have to hit
              accurately. Most visible on a one- or two-day poll, where there is
              the most spare width to misplace.
            */}
              <th className="sticky left-0 z-10 w-px bg-surface px-1 py-1" />
              {days.map((day, i) => {
                const { weekday, dayOfMonth, month, showMonth } = dayHeaders[i];
                return (
                  <th key={day} className="bg-surface px-1 py-1 font-medium text-ink-muted">
                    <div className="text-[0.7rem] uppercase tracking-wide text-ink-faint">
                      {weekday}
                    </div>
                    <div className="text-sm font-semibold text-ink-muted">{dayOfMonth}</div>
                    <div
                      className={`text-[0.65rem] ${
                        showMonth ? "text-ink-soft" : "text-transparent"
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
                <th className="sticky left-0 z-10 w-px whitespace-nowrap bg-surface px-2 py-1 text-right font-normal tabular-nums text-ink-soft">
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
                        className={`h-11 min-w-[2.75rem] cursor-pointer rounded transition-colors sm:h-9 ${
                          on ? "bg-ok-solid" : "bg-slot hover:bg-slot-hover"
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
      {days.length > 4 && (
        <p className="mt-2 text-center text-xs text-ink-faint sm:hidden">
          Swipe the grid sideways for the rest of the days.
        </p>
      )}
    </div>
  );
}

/**
 * Memoised because the parent owns unrelated state — the comment field, the
 * activity tick boxes — and a keystroke in any of it would otherwise re-render
 * every cell of the grid.
 */
export const AvailabilityGrid = memo(AvailabilityGridImpl);
