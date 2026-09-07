import Link from "next/link";
import { instantToKl } from "@/lib/slots";

export interface CalendarEntry {
  id: string;
  href: string;
  label: string;
  /** YYYY-MM-DD in Kuala Lumpur terms. */
  date: string;
  tone: "session" | "event";
  detail?: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Month grid for the season-long view: which weeks actually happened, and what
 * is coming. Complements the heatmap, which answers a different question (which
 * hour to book), by showing the rhythm across weeks.
 */
export function MonthCalendar({
  year,
  month,
  entries,
}: {
  year: number;
  month: number; // 1-12
  entries: CalendarEntry[];
}) {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Monday-first offset.
  const leading = (firstOfMonth.getUTCDay() + 6) % 7;

  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const bucket = byDate.get(entry.date);
    if (bucket) bucket.push(entry);
    else byDate.set(entry.date, [entry]);
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const todayKl = instantToKl(new Date()).date;

  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} className="min-h-[5rem] rounded-lg bg-slate-50" />;
          const dayEntries = byDate.get(date) ?? [];
          const isToday = date === todayKl;
          return (
            <div
              key={date}
              className={`min-h-[5rem] rounded-lg border p-1 ${
                isToday ? "border-slate-900 bg-white" : "border-slate-200 bg-white"
              }`}
            >
              <div className={`text-xs ${isToday ? "font-bold" : "text-slate-500"}`}>
                {Number(date.slice(-2))}
              </div>
              <div className="mt-1 space-y-1">
                {dayEntries.map((entry) => (
                  <Link
                    key={entry.id}
                    href={entry.href}
                    title={entry.detail}
                    className={`block truncate rounded px-1 py-0.5 text-[11px] font-medium ${
                      entry.tone === "session"
                        ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                        : "bg-indigo-100 text-indigo-900 hover:bg-indigo-200"
                    }`}
                  >
                    {entry.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
