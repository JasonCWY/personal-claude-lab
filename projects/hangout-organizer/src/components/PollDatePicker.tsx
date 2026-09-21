"use client";

import { useMemo, useState } from "react";
import { formatDayHeader, instantToKl } from "@/lib/slots";

/**
 * Which dates is this poll about, and what hours on each of them.
 *
 * Replaced a "poll from / poll until" pair plus one earliest/latest window
 * applied to every day in between. That shape could only ask one question:
 * everybody free at the same hours, every day. A group that plays Tuesday
 * evenings and Saturday mornings had to poll 09:00-22:00 on both and let the
 * grid ask thirteen questions to get at four.
 *
 * Dates are picked individually, so the poll asks about exactly the days the
 * host means; each date owns its own list of windows; and a date can carry
 * more than one, because Saturday morning and Saturday evening are two
 * different offers and merging them would invent an afternoon nobody proposed.
 *
 * The whole thing submits as ONE JSON field. Parallel arrays of dates, starts
 * and ends reassembled by index on the server go wrong silently the moment one
 * of them is a different length, and this structure is genuinely nested.
 */

export interface PickedWindow {
  /** Local id, so React keys survive editing. Never leaves the browser. */
  key: string;
  start: string;
  end: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

let counter = 0;
const nextKey = () => `w${counter++}`;

function addMonths(year: number, month: number, delta: number): [number, number] {
  const m = month - 1 + delta;
  return [year + Math.floor(m / 12), ((m % 12) + 12) % 12 + 1];
}

export function PollDatePicker({ byDate }: { byDate: boolean }) {
  const today = instantToKl(new Date()).date;
  const [y, m] = today.split("-").map(Number);

  const [year, setYear] = useState(y);
  const [month, setMonth] = useState(m);

  // date -> its windows. A date poll keeps an empty list per date: it asks
  // about whole days, so there are no hours to attach.
  const [picked, setPicked] = useState<Map<string, PickedWindow[]>>(new Map());
  const [defaultStart, setDefaultStart] = useState("18:00");
  const [defaultEnd, setDefaultEnd] = useState("22:00");

  const dates = useMemo(() => [...picked.keys()].sort(), [picked]);

  /** The JSON the server action parses. A date poll submits dates only. */
  const payload = useMemo(
    () =>
      JSON.stringify(
        dates.flatMap((date) => {
          const windows = picked.get(date) ?? [];
          if (byDate || windows.length === 0) return [{ date }];
          return windows.map((w) => ({ date, start: w.start, end: w.end }));
        }),
      ),
    [dates, picked, byDate],
  );

  function toggleDate(date: string) {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(date)) next.delete(date);
      // A newly picked date inherits whatever the default currently says, so
      // the common "same times every day" poll needs no per-date editing at
      // all. Overriding one afterwards does not disturb the others.
      else next.set(date, byDate ? [] : [{ key: nextKey(), start: defaultStart, end: defaultEnd }]);
      return next;
    });
  }

  /**
   * Overwrite every picked date with the default window.
   *
   * Deliberately destructive of per-date edits, and worded as such on the
   * button: the reason to reach for it is that the defaults changed after the
   * dates were picked, and a version that spared edited dates would leave the
   * host unable to tell which ones it had skipped.
   */
  function applyToAll() {
    setPicked((prev) => {
      const next = new Map<string, PickedWindow[]>();
      for (const date of prev.keys()) {
        next.set(date, [{ key: nextKey(), start: defaultStart, end: defaultEnd }]);
      }
      return next;
    });
  }

  function addWindow(date: string) {
    setPicked((prev) => {
      const next = new Map(prev);
      next.set(date, [
        ...(prev.get(date) ?? []),
        { key: nextKey(), start: defaultStart, end: defaultEnd },
      ]);
      return next;
    });
  }

  function removeWindow(date: string, key: string) {
    setPicked((prev) => {
      const next = new Map(prev);
      const rest = (prev.get(date) ?? []).filter((w) => w.key !== key);
      // A date with no windows left asks about nothing, so removing the last
      // one un-picks the date rather than leaving a heading with a gap under
      // it that the server would then have to reject.
      if (rest.length === 0) next.delete(date);
      else next.set(date, rest);
      return next;
    });
  }

  function editWindow(date: string, key: string, field: "start" | "end", value: string) {
    setPicked((prev) => {
      const next = new Map(prev);
      next.set(
        date,
        (prev.get(date) ?? []).map((w) => (w.key === key ? { ...w, [field]: value } : w)),
      );
      return next;
    });
  }

  // Monday-first, matching MonthCalendar.
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = (firstOfMonth.getUTCDay() + 6) % 7;
  const pad = (n: number) => String(n).padStart(2, "0");

  const fieldClass =
    "min-h-tap rounded-lg border border-line-strong bg-surface px-2 py-2 text-base text-ink tabular-nums focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";

  return (
    <div className="sm:col-span-2">
      <input type="hidden" name="windows" value={payload} />

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Which dates
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => {
                const [ny, nm] = addMonths(year, month, -1);
                setYear(ny);
                setMonth(nm);
              }}
              className="min-h-tap w-11 rounded-lg text-lg text-ink-muted transition-colors hover:bg-surface-2"
            >
              ‹
            </button>
            <span className="text-sm font-medium">
              {MONTHS[month - 1]} {year}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => {
                const [ny, nm] = addMonths(year, month, 1);
                setYear(ny);
                setMonth(nm);
              }}
              className="min-h-tap w-11 rounded-lg text-lg text-ink-muted transition-colors hover:bg-surface-2"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((d) => (
              <div key={d} className="pb-1 text-[0.65rem] uppercase tracking-wide text-ink-faint">
                {d}
              </div>
            ))}
            {Array.from({ length: leading }, (_, i) => (
              <div key={`lead-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const date = `${year}-${pad(month)}-${pad(i + 1)}`;
              const on = picked.has(date);
              // A poll for a day that has gone cannot be answered. Today
              // itself stays available — an evening session is often arranged
              // the same afternoon. The server re-checks this.
              const past = date < today;
              return (
                <button
                  key={date}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`${formatDayHeader(date).weekday} ${i + 1} ${MONTHS[month - 1]}`}
                  disabled={past}
                  onClick={() => toggleDate(date)}
                  className={`flex min-h-tap items-center justify-center rounded-lg text-sm tabular-nums transition active:scale-[0.97] ${
                    past
                      ? "cursor-not-allowed text-ink-faint opacity-40"
                      : on
                        ? "bg-ok-solid font-semibold text-ok-solid-fg"
                        : "bg-slot text-ink hover:bg-slot-hover"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-ink-soft">
            {dates.length === 0
              ? "Tap the dates you want to ask about. They do not have to be in a row."
              : `${dates.length} date${dates.length === 1 ? "" : "s"} picked.`}
          </p>
        </div>

        <div>
          {!byDate && (
            <div className="mb-3 rounded-xl border border-line bg-surface-2 p-3">
              <h3 className="text-sm font-medium">Default times</h3>
              <p className="mt-0.5 text-xs text-ink-soft">
                Every date you pick starts with these. Change any of them below.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="time"
                  step={900}
                  value={defaultStart}
                  onChange={(e) => setDefaultStart(e.target.value)}
                  aria-label="Default start time"
                  className={fieldClass}
                />
                <span className="text-ink-soft">–</span>
                <input
                  type="time"
                  step={900}
                  value={defaultEnd}
                  onChange={(e) => setDefaultEnd(e.target.value)}
                  aria-label="Default end time"
                  className={fieldClass}
                />
                <button
                  type="button"
                  onClick={applyToAll}
                  disabled={dates.length === 0}
                  className="min-h-tap rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium transition hover:bg-surface-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
                >
                  Apply to all dates
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                00:00 means the end of that evening. Past midnight is fine — an end at or before
                the start rolls onto the next day.
              </p>
            </div>
          )}

          {dates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong p-4 text-sm text-ink-soft">
              Nothing picked yet.
            </div>
          ) : (
            <div className="space-y-2">
              {dates.map((date) => {
                const { weekday, dayOfMonth, month: mon } = formatDayHeader(date);
                const windows = picked.get(date) ?? [];
                return (
                  <div key={date} className="rounded-xl border border-line bg-surface p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {weekday} {dayOfMonth} {mon}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleDate(date)}
                        aria-label={`Remove ${weekday} ${dayOfMonth} ${mon}`}
                        className="rounded-lg px-2 py-1 text-xs text-ink-soft underline transition-colors hover:text-bad-fg"
                      >
                        Remove
                      </button>
                    </div>

                    {!byDate && (
                      <div className="mt-2 space-y-2">
                        {windows.map((w) => (
                          <div key={w.key} className="flex flex-wrap items-center gap-2">
                            <input
                              type="time"
                              step={900}
                              value={w.start}
                              onChange={(e) => editWindow(date, w.key, "start", e.target.value)}
                              aria-label={`Start time on ${date}`}
                              className={fieldClass}
                            />
                            <span className="text-ink-soft">–</span>
                            <input
                              type="time"
                              step={900}
                              value={w.end}
                              onChange={(e) => editWindow(date, w.key, "end", e.target.value)}
                              aria-label={`End time on ${date}`}
                              className={fieldClass}
                            />
                            <button
                              type="button"
                              onClick={() => removeWindow(date, w.key)}
                              aria-label={`Remove this window on ${date}`}
                              className="min-h-tap w-11 rounded-lg text-ink-soft transition-colors hover:bg-surface-2 hover:text-bad-fg"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addWindow(date)}
                          className="rounded-lg py-1 text-xs font-medium text-accent underline"
                        >
                          + add another window on this date
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!byDate && dates.length > 0 && (
            <p className="mt-2 text-xs text-ink-soft">
              Two windows that overlap on the same date are merged into one. Two that do not are
              shown to friends with a visible break between them.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
