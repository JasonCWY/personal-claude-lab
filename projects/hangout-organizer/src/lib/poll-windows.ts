/**
 * Parsing and validating the dates a host picked for a poll.
 *
 * PURE MODULE (same rule as quorum.ts and slots.ts). This lived inside
 * `actions.ts`, which is `"use server"` — so the one piece of new logic
 * standing between a form post and the shape of `poll_windows` was the piece
 * nothing could test. It is the gate on a structure the public submit route
 * then validates every friend's answer against, which makes it worth the same
 * treatment as the scheduling engine.
 *
 * Every message here is written to be read by the host, mid-form, on a phone.
 */

import { instantToKl, shiftDate } from "@/lib/slots";

/**
 * One window as the form submits it: a KL date plus, on a time poll, a start
 * and end. A date poll submits dates with no times at all.
 */
export interface SubmittedWindow {
  date: string;
  start: string | null;
  end: string | null;
}

/**
 * Bounds, because this is user input that becomes rows and then cells.
 *
 * A poll over 60 dates at 30-minute slots is already 1,400-odd cells and an
 * unusable page; these stop a slip in the picker from producing a grid nobody
 * can answer and a page nobody can render.
 */
export const MAX_DATES = 60;
export const MAX_WINDOWS_PER_DATE = 6;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A real calendar date, not merely a well-shaped one.
 *
 * `Date.parse` is no use here: it does not reject "2026-02-31", it silently
 * rolls it forward to 3 March. A past date like that gets caught by the
 * already-passed check by accident, but a FUTURE one — "2026-11-31" — would
 * sail through and reach a Postgres `date` column, where the host's reward for
 * a mistyped date is a raw "date/time field value out of range" instead of a
 * sentence. Round-tripping through UTC is what actually asks the question.
 */
function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
}

/**
 * The picked dates and their windows, from the picker's one JSON field.
 *
 * A field per window would mean parallel arrays — dates, starts, ends —
 * reassembled by index on the server, which goes wrong silently the moment one
 * of them is a different length. The picker owns a nested structure, so it
 * submits one.
 *
 * Returns null only when the payload is unparseable, which is a broken client
 * rather than a host mistake; the caller says so differently.
 */
export function parseWindows(raw: string): SubmittedWindow[] | null {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const out: SubmittedWindow[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") return null;
    const w = entry as Record<string, unknown>;
    if (typeof w.date !== "string") return null;
    out.push({
      date: w.date,
      start: typeof w.start === "string" && w.start ? w.start : null,
      end: typeof w.end === "string" && w.end ? w.end : null,
    });
  }
  return out;
}

/** The longest run of consecutive dates in an ascending, deduped list. */
export function longestRun(dates: string[]): number {
  let best = 0;
  let run = 0;
  for (let i = 0; i < dates.length; i++) {
    run = i > 0 && shiftDate(dates[i - 1], 1) === dates[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** The distinct dates a set of submitted windows covers, ascending. */
export function submittedDates(windows: SubmittedWindow[]): string[] {
  return [...new Set(windows.map((w) => w.date))].sort();
}

export interface ValidateOptions {
  /** True for a whole-dates poll, which asks no times. */
  byDate: boolean;
  /** Consecutive days the trip needs. Only read when `byDate`. */
  fullDays?: number;
  /** KL "today", injected so this stays pure and testable. */
  now?: Date;
}

/**
 * Everything wrong with a set of picked windows, or null if nothing is.
 *
 * Mirrors the CHECK constraints on `poll_windows` so the host gets a sentence
 * rather than a form that silently does nothing. Keep the two in step.
 */
export function validateWindows(
  windows: SubmittedWindow[],
  options: ValidateOptions,
): string | null {
  const dates = submittedDates(windows);
  if (dates.length === 0) {
    return "Pick at least one date — tap the days you want to ask about on the calendar.";
  }
  if (dates.length > MAX_DATES) {
    return `That is ${dates.length} dates. Keep it to ${MAX_DATES} or fewer, or nobody will get to the bottom of the grid.`;
  }

  // A poll for a day that has already gone cannot be answered usefully, and it
  // is the same failure a past cut-off is refused for: a link that opens on
  // something already over. Today itself is fine — an evening session is often
  // arranged the same afternoon.
  const today = instantToKl(options.now ?? new Date()).date;
  for (const date of dates) {
    if (!isRealDate(date)) {
      return `${date} is not a real date. Reload the page and try again.`;
    }
    if (date < today) {
      return `${date} has already passed, so nobody could answer for it.`;
    }
  }

  if (options.byDate) {
    const days = options.fullDays ?? 1;
    if (!Number.isInteger(days) || days < 1) {
      return "How many days must be a whole number, 1 or more.";
    }
    // Asking for a 5-day run when the longest stretch of picked dates is 3 can
    // never succeed, and failing here is clearer than an empty results page
    // later. The RUN, not the count: dates the host skipped are a real break,
    // so Fri + Sun is two one-day options and not a weekend.
    const run = longestRun(dates);
    if (days > run) {
      return `You are asking for ${days} days in a row, but the longest run of dates you picked is ${run}. Pick more consecutive dates, or ask for fewer days.`;
    }
    return null;
  }

  const perDate = new Map<string, number>();
  for (const w of windows) {
    perDate.set(w.date, (perDate.get(w.date) ?? 0) + 1);
    if (!w.start || !w.end) {
      return `${w.date} has a window with no start or end time on it.`;
    }
    if (!TIME_PATTERN.test(w.start) || !TIME_PATTERN.test(w.end)) {
      return `${w.date} has a window with a time that is not a real time.`;
    }
    // An end at or before the start means the next day, so 22:00–00:00 is
    // valid. Only equality is wrong: that would be a 24-hour window.
    if (w.start === w.end) {
      return `${w.date} has a window that starts and ends at ${w.start}.`;
    }
  }
  for (const [date, count] of perDate) {
    if (count > MAX_WINDOWS_PER_DATE) {
      return `${date} has ${count} windows on it. Keep it to ${MAX_WINDOWS_PER_DATE} — overlapping ones get merged anyway.`;
    }
  }

  return null;
}
