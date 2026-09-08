/**
 * Slot grid + timezone helpers.
 *
 * PURE MODULE (same rule as quorum.ts).
 *
 * Everything is stored as UTC `timestamptz` and rendered in Asia/Kuala_Lumpur.
 * Malaysia is a fixed UTC+8 with no DST, which is why fixed-offset arithmetic is
 * safe here — do not copy this approach to a timezone that observes DST.
 */

export const KL_TIMEZONE = "Asia/Kuala_Lumpur";
export const KL_OFFSET_MINUTES = 8 * 60;
export const CURRENCY = "MYR";

const MINUTE_MS = 60_000;
const MINUTES_PER_DAY = 24 * 60;
const DAY_MS = MINUTES_PER_DAY * MINUTE_MS;

/** "2026-09-10" + "19:30" (Kuala Lumpur wall clock) -> absolute instant. */
export function klToInstant(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - KL_OFFSET_MINUTES * MINUTE_MS);
}

/** Absolute instant -> Kuala Lumpur wall-clock parts. */
export function instantToKl(instant: Date): {
  date: string;
  time: string;
  weekday: string;
  dayOfMonth: number;
} {
  const shifted = new Date(instant.getTime() + KL_OFFSET_MINUTES * MINUTE_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
  return {
    date,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][shifted.getUTCDay()],
    dayOfMonth: shifted.getUTCDate(),
  };
}

export function formatKl(instant: Date): string {
  const { weekday, date, time } = instantToKl(instant);
  const [, m, d] = date.split("-");
  const month = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][Number(m) - 1];
  return `${weekday} ${Number(d)} ${month}, ${time}`;
}

export function formatDuration(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60}hr`;
  return `${Math.floor(minutes / 60)}hr ${minutes % 60}min`;
}

export interface SlotGridSpec {
  pollStartDate: string; // YYYY-MM-DD
  pollEndDate: string; // YYYY-MM-DD
  dayStartTime: string; // HH:MM
  /**
   * HH:MM. If this is at or before dayStartTime it means the NEXT day, so a
   * 22:00-02:00 session is four hours, not a negative one. "22:00-00:00" is the
   * common case and needs no day rollover at all: the last slot that fits
   * starts at 23:30.
   */
  dayEndTime: string; // HH:MM
  slotMinutes: number;
}

export interface SlotGrid {
  /** Column headers — one per polled day. */
  days: string[];
  /** Row headers — one per time-of-day slot. */
  times: string[];
  /** grid[timeIndex][dayIndex] = the instant that slot starts. */
  grid: Date[][];
}

/**
 * Every slot being polled, as a times x days grid.
 *
 * Note the row/column order: the UI renders times down the left and days across
 * the top, so indexing is [time][day].
 */
export function buildSlotGrid(spec: SlotGridSpec): SlotGrid {
  const days: string[] = [];
  const start = klToInstant(spec.pollStartDate, "00:00");
  const end = klToInstant(spec.pollEndDate, "00:00");
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    days.push(instantToKl(new Date(t)).date);
  }

  const [sh, sm] = spec.dayStartTime.split(":").map(Number);
  const [eh, em] = spec.dayEndTime.split(":").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");

  const startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  // An end at or before the start means the session runs into the next day.
  if (endMins <= startMins) endMins += MINUTES_PER_DAY;

  // Minutes from midnight of the polled day, so a value past 1440 is tomorrow.
  const offsets: number[] = [];
  for (let mins = startMins; mins + spec.slotMinutes <= endMins; mins += spec.slotMinutes) {
    offsets.push(mins);
  }

  const times = offsets.map((mins) => {
    const wrapped = mins % MINUTES_PER_DAY;
    return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
  });

  // Slots that spilled past midnight belong to the following calendar day.
  const grid = offsets.map((mins, i) =>
    days.map(
      (day) =>
        new Date(
          klToInstant(day, times[i]).getTime() +
            Math.floor(mins / MINUTES_PER_DAY) * DAY_MS,
        ),
    ),
  );
  return { days, times, grid };
}

/** Default poll window: the coming week, starting tomorrow. */
export function defaultPollRange(today = new Date()): {
  start: string;
  end: string;
} {
  const base = new Date(today.getTime() + KL_OFFSET_MINUTES * MINUTE_MS);
  const startMs = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()) + DAY_MS;
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };
  return { start: fmt(startMs), end: fmt(startMs + 6 * DAY_MS) };
}

/** Shift a date string by N days, for "duplicate last session". */
export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Column header for a polled day: "Mon 14 Sep".
 *
 * The month matters — a poll can straddle one, and a bare "14" over a grid the
 * host is reading in a hurry is genuinely ambiguous.
 */
export function formatDayHeader(dateStr: string): {
  weekday: string;
  dayOfMonth: number;
  month: string;
} {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
  return { weekday, dayOfMonth: d, month: MONTHS[m - 1] };
}

/** Whether a poll spans more than one month, so headers can say so once. */
export function spansMonths(days: string[]): boolean {
  return new Set(days.map((d) => d.slice(0, 7))).size > 1;
}

/** "19:00" + 30 -> "19:00–19:30". A range reads far better than a bare start. */
export function formatSlotRange(time: string, slotMinutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const end = (h * 60 + m + slotMinutes) % MINUTES_PER_DAY;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${time}–${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
}

/** "Tue 15 Sep, 19:00 – 21:00" for a confirmed booking or a bookable block. */
export function formatSpan(start: Date, minutes: number): string {
  const a = instantToKl(start);
  const b = instantToKl(new Date(start.getTime() + minutes * MINUTE_MS));
  const { weekday, dayOfMonth, month } = formatDayHeader(a.date);
  const sameDay = a.date === b.date;
  return sameDay
    ? `${weekday} ${dayOfMonth} ${month}, ${a.time} – ${b.time}`
    : `${weekday} ${dayOfMonth} ${month}, ${a.time} – ${b.time} (next day)`;
}
