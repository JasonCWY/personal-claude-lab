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
    if (count === 0) return "bg-white";
    const ratio = count / max;
    if (ratio <= 0.25) return "bg-emerald-100";
    if (ratio <= 0.5) return "bg-emerald-200";
    if (ratio <= 0.75) return "bg-emerald-400 text-white";
    return "bg-emerald-600 text-white";
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0.5 text-center text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white px-2 py-1" />
            {days.map((day, i) => {
              const { weekday, dayOfMonth, month } = formatDayHeader(day);
              const showMonth = i === 0 || formatDayHeader(days[i - 1]).month !== month;
              return (
                <th key={day} className="px-2 py-1 font-medium text-slate-600">
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
              <th className="sticky left-0 whitespace-nowrap bg-white px-2 py-1 text-right font-normal tabular-nums text-slate-500">
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
                    className={`h-8 min-w-[2.75rem] rounded font-medium ${shade(people.length)}`}
                  >
                    {people.length || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
