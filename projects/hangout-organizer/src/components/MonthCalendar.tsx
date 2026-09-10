import Link from "next/link";
import { instantToKl } from "@/lib/slots";

export interface CalendarEntry {
  id: string;
  href: string;
  label: string;
  /** YYYY-MM-DD in Kuala Lumpur terms. */
  date: string;
  /**
   * HH:MM in Kuala Lumpur terms, for entries that have a start time. Events
   * carry a date but no clock time, so they are left undefined and sort ahead
   * of the timed entries the way an all-day row does in any other calendar.
   */
  time?: string;
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

  /*
   * A day cell and an agenda row both read top to bottom, so the order inside a
   * day has to be the order the day happens in — not the order the two queries
   * came back in, which put every session ahead of every event regardless of
   * clock time. Sort once here rather than at each call site: the component
   * owns how a day reads.
   */
  const inOrder = [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      a.label.localeCompare(b.label),
  );

  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of inOrder) {
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

  /*
   * Below `sm` a seven-column month grid gives each day about 44px, which is a
   * fine tap target and nowhere near enough room for "19:30 Badminton" — the
   * labels truncated to three or four characters and told you nothing. So the
   * phone gets the grid as a shape (which days are busy, marked with dots) plus
   * a real agenda list underneath, and the labels come back once the columns
   * are wide enough to hold them.
   */
  const agenda = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-ink-soft">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date)
            return (
              <div
                key={`pad-${i}`}
                className="min-h-[3rem] rounded-lg bg-surface-2 sm:min-h-[5rem]"
              />
            );
          const dayEntries = byDate.get(date) ?? [];
          const isToday = date === todayKl;
          return (
            <div
              key={date}
              className={`min-h-[3rem] rounded-lg border bg-surface p-1 sm:min-h-[5rem] ${
                isToday ? "border-accent ring-1 ring-accent" : "border-line"
              }`}
            >
              <div className={`text-xs ${isToday ? "font-bold text-ink" : "text-ink-soft"}`}>
                {Number(date.slice(-2))}
              </div>

              <div className="mt-1 flex gap-0.5 sm:hidden" aria-hidden>
                {dayEntries.slice(0, 4).map((entry) => (
                  <span
                    key={entry.id}
                    className={`h-1.5 w-1.5 rounded-full ${
                      entry.tone === "session" ? "bg-ok-solid" : "bg-info-fg"
                    }`}
                  />
                ))}
              </div>

              <div className="mt-1 hidden space-y-1 sm:block">
                {dayEntries.map((entry) => (
                  <Link
                    key={entry.id}
                    href={entry.href}
                    title={entry.detail}
                    className={`block truncate rounded px-1 py-0.5 text-[11px] font-medium ${
                      entry.tone === "session"
                        ? "bg-ok-bg text-ok-fg hover:bg-ok-border"
                        : "bg-info-bg text-info-fg hover:bg-info-bg-hover"
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

      {agenda.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-line pt-4 sm:hidden">
          {agenda.map(([date, dayEntries]) => (
            <li key={date} className="flex gap-3">
              <span className="w-12 shrink-0 pt-2 text-xs tabular-nums text-ink-soft">
                {shortDate(date)}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                {dayEntries.map((entry) => (
                  <Link
                    key={entry.id}
                    href={entry.href}
                    className={`flex min-h-tap items-center rounded-lg px-3 py-2 text-sm font-medium ${
                      entry.tone === "session"
                        ? "bg-ok-bg text-ok-fg"
                        : "bg-info-bg text-info-fg"
                    }`}
                  >
                    <span className="truncate">{entry.label}</span>
                  </Link>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "2026-09-14" -> "Mon 14", the two things worth 12 characters of width. */
function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
  return `${weekday} ${d}`;
}
