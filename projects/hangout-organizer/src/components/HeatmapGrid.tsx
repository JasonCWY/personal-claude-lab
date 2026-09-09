import { buildSlotGrid, formatDayHeader, formatSlotRange } from "@/lib/slots";
import type { Person } from "@/lib/types";

/**
 * Host-facing density view: darker cell = more people free in that slot.
 *
 * This shows PER-SLOT counts, which is not the same question as "can we book a
 * two-hour block" — that is what QuorumSlots answers. Both are shown because a
 * dark column with no qualifying window is a real and confusing state, and the
 * heatmap is what makes it legible.
 */
export function HeatmapGrid({
  spec,
  slotCounts,
  roster,
}: {
  spec: {
    pollStartDate: string;
    pollEndDate: string;
    granularity?: "time" | "date";
    dayStartTime: string;
    dayEndTime: string;
    slotMinutes: number;
  };
  slotCounts: Map<number, string[]>;
  roster: Person[];
}) {
  const { days, times, grid } = buildSlotGrid(spec);
  const names = new Map(roster.map((p) => [p.id, p.display_name]));

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

  return (
    <div className="-mx-1 scroll-x px-1">
      <table className="min-w-full border-separate border-spacing-0.5 text-center text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-surface px-2 py-1" />
            {days.map((day, i) => {
              const { weekday, dayOfMonth, month } = formatDayHeader(day);
              const showMonth = i === 0 || formatDayHeader(days[i - 1]).month !== month;
              return (
                <th key={day} className="px-2 py-1 font-medium text-ink-muted">
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
              <th className="sticky left-0 whitespace-nowrap bg-surface px-2 py-1 text-right font-normal tabular-nums text-ink-soft">
                <span className="text-[0.7rem]">
                  {spec.granularity === "date"
                    ? "free"
                    : formatSlotRange(time, spec.slotMinutes)}
                </span>
              </th>
              {days.map((day, di) => {
                const people = slotCounts.get(grid[ti][di].getTime()) ?? [];
                return (
                  <td
                    key={day}
                    title={`${
                      spec.granularity === "date"
                        ? day
                        : formatSlotRange(time, spec.slotMinutes)
                    } — ${
                      people.length
                        ? people.map((id) => names.get(id) ?? id).join(", ")
                        : "nobody free"
                    }`}
                    className={`h-9 min-w-[2.75rem] rounded font-medium sm:h-8 ${shade(people.length)}`}
                  >
                    {people.length || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {days.length > 4 && (
        <p className="mt-2 text-center text-xs text-ink-faint sm:hidden">
          Swipe sideways for the rest of the days.
        </p>
      )}
    </div>
  );
}
