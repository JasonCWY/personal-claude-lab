"use client";

import { buildSlotGrid, formatDayHeader } from "@/lib/slots";
import type { SlotGridSpec } from "@/lib/slots";
import type { Person } from "@/lib/types";

/**
 * Host-facing density view: darker cell = more people free in that slot.
 *
 * This shows PER-SLOT counts, which is not the same question as "can we book a
 * two-hour block" — that is what BookableBlocks answers. Both are shown because
 * a dark column with no qualifying window is a real and confusing state, and
 * the heatmap is what makes it legible.
 *
 * Laid out per date, matching the friend-facing grid: there is no shared time
 * axis any more, so each cell carries its own time and a break between two
 * windows on one date is drawn rather than implied.
 */
export interface SelectedSlot {
  time: number;
  date: string;
  /** "18:00–19:00", or "" on a date poll where a cell has no time range. */
  label: string;
}

export function HeatmapGrid({
  spec,
  slotCounts,
  roster,
  selected,
  onSelectSlot,
}: {
  spec: SlotGridSpec;
  slotCounts: Map<number, string[]>;
  roster: Person[];
  /** The tapped slot's timestamp, so its cell can be highlighted. */
  selected?: number | null;
  /** Tapping a cell again clears it — the caller owns that toggle. */
  onSelectSlot?: (cell: SelectedSlot | null) => void;
}) {
  const { columns, rows } = buildSlotGrid(spec);
  const names = new Map(roster.map((p) => [p.id, p.display_name]));
  const byDate = spec.granularity === "date";

  const max = Math.max(1, ...[...slotCounts.values()].map((v) => v.length));

  function shade(count: number): string {
    if (count === 0) return "bg-surface";
    const ratio = count / max;
    // The two pale steps carry dark text and the two saturated ones light. The
    // ramp inverts between themes but that pairing does not, so a count stays
    // readable at every density in both.
    if (ratio <= 0.25) return "bg-heat-1 text-ok-fg";
    if (ratio <= 0.5) return "bg-heat-2 text-ok-fg";
    if (ratio <= 0.75) return "bg-heat-3 text-heat-fg";
    return "bg-heat-4 text-heat-fg";
  }

  if (columns.length === 0) {
    return <p className="text-sm text-ink-soft">This poll has no dates on it.</p>;
  }

  return (
    <div className="-mx-1 scroll-x px-1">
      <table className="min-w-full border-separate border-spacing-0.5 text-center text-xs">
        <thead>
          <tr>
            {columns.map((column, i) => {
              const { weekday, dayOfMonth, month } = formatDayHeader(column.date);
              const showMonth =
                i === 0 || formatDayHeader(columns[i - 1].date).month !== month;
              return (
                <th key={column.date} className="px-2 py-1 font-medium text-ink-muted">
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
                      <div aria-hidden="true" className="flex h-5 items-center justify-center">
                        <span className="h-px w-full border-t border-dashed border-line-strong" />
                      </div>
                    </td>
                  );
                }

                const time = cell.start.getTime();
                const people = slotCounts.get(time) ?? [];
                const isSelected = selected === time;
                return (
                  <td key={column.date} className="p-0">
                    {/*
                      A <button> so the same "who's free then" the desktop
                      `title` tooltip has always carried is reachable by tap —
                      a floating popover was ruled out because the grid's own
                      `overflow-x` scroll container breaks sticky/absolute
                      positioning on the other axis; the caller renders the
                      answer in a panel below the table instead.
                    */}
                    <button
                      type="button"
                      title={`${byDate ? column.date : `${column.date} ${cell.label}`} — ${
                        people.length
                          ? people.map((id) => names.get(id) ?? id).join(", ")
                          : "nobody free"
                      }`}
                      onClick={() =>
                        onSelectSlot?.(
                          isSelected ? null : { time, date: column.date, label: cell.label },
                        )
                      }
                      className={`h-11 min-w-[4.5rem] w-full rounded align-middle font-medium sm:h-9 ${shade(
                        people.length,
                      )} ${isSelected ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : ""}`}
                    >
                      {/* Same range treatment as the friend grid — see there. */}
                      <span className="block text-[0.65rem] font-normal leading-none opacity-80">
                        {byDate ? (
                          "free"
                        ) : (
                          <>
                            {cell.time}
                            <span className="opacity-65">–{cell.endTime}</span>
                          </>
                        )}
                      </span>
                      {people.length || ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {columns.length > 3 && (
        <p className="mt-2 text-center text-xs text-ink-faint sm:hidden">
          Swipe sideways for the rest of the dates.
        </p>
      )}
    </div>
  );
}
