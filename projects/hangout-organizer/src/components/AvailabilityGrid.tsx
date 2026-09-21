"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSlotGrid, formatDayHeader } from "@/lib/slots";
import type { SlotGridSpec } from "@/lib/slots";

interface Props {
  spec: SlotGridSpec;
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
 * THERE IS NO SHARED TIME AXIS. Each date carries its own windows, so row 3 of
 * Monday and row 3 of Saturday are different hours. That is why the time lives
 * inside every cell instead of in a row header down the left: a header column
 * would be a single label claiming to describe cells that no longer agree with
 * it, which is worse than no header at all. Columns are padded to a common
 * height so the table stays rectangular even though its contents are not.
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
  // comment box below used to be enough to trigger that. The windows array is
  // built fresh by the server component on each render, so it is keyed on its
  // content rather than its identity.
  const windowKey = JSON.stringify(spec.windows);
  const { columns, rows } = useMemo(
    () => buildSlotGrid(spec),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [windowKey, spec.slotMinutes, spec.granularity],
  );

  const headers = useMemo(
    () =>
      columns.map((column, i) => {
        const parts = formatDayHeader(column.date);
        return {
          ...parts,
          // Repeat the month only when it changes, so a poll crossing
          // September into October says so exactly where it matters.
          showMonth: i === 0 || formatDayHeader(columns[i - 1].date).month !== parts.month,
        };
      }),
    [columns],
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

  if (columns.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface-2 p-4 text-sm text-ink-soft">
        This poll has no dates on it yet.
      </p>
    );
  }

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
              {columns.map((column, i) => {
                const { weekday, dayOfMonth, month, showMonth } = headers[i];
                return (
                  <th
                    key={column.date}
                    className="bg-surface px-1 py-1 font-medium text-ink-muted"
                  >
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
            {Array.from({ length: rows }, (_, ri) => (
              <tr key={ri}>
                {columns.map((column) => {
                  const cell = column.cells[ri];

                  if (cell.kind === "pad") {
                    return <td key={column.date} className="p-0" />;
                  }

                  if (cell.kind === "gap") {
                    return (
                      <td key={column.date} className="p-0">
                        {/*
                          The break between two windows on one date. Drawn
                          rather than left blank: a blank cell is indis-
                          tinguishable from the padding under a short column,
                          and the thing a friend has to notice here is that
                          Saturday morning and Saturday evening are two
                          separate offers with no afternoon between them.
                        */}
                        <div
                          aria-hidden="true"
                          className="flex h-5 items-center justify-center"
                        >
                          <span className="h-px w-full border-t border-dashed border-line-strong" />
                        </div>
                      </td>
                    );
                  }

                  const key = cell.start.getTime();
                  const on = selected.has(key);
                  return (
                    <td key={column.date} className="p-0">
                      <div
                        data-slot={key}
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`${column.date} ${cell.label}`}
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
                        className={`flex h-11 min-w-[4.5rem] cursor-pointer items-center justify-center rounded tabular-nums transition-colors sm:h-9 ${
                          on
                            ? "bg-ok-solid text-ok-solid-fg"
                            : "bg-slot text-ink-soft hover:bg-slot-hover"
                        }`}
                      >
                        {/*
                          The full range, in the cell. With no shared axis this
                          is the only thing saying what the cell means, and a
                          bare start time cannot say it: whether "18:00" is an
                          hour or a half depends on a slot size stated nowhere
                          on this page, and the person tapping it is deciding
                          what they are committing to.

                          The end is faded rather than omitted. At full weight
                          every cell repeats eleven digits and the column stops
                          being scannable; faded, the eye still runs down the
                          start times while the range is there when looked at.
                          `pointer-events-none` keeps elementFromPoint landing
                          on the slot div during a drag rather than on the text.
                        */}
                        <span className="pointer-events-none text-[0.7rem] leading-none">
                          {cell.time}
                          <span className="opacity-55">–{cell.endTime}</span>
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {columns.length > 3 && (
        <p className="mt-2 text-center text-xs text-ink-faint sm:hidden">
          Swipe the grid sideways for the rest of the dates.
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
