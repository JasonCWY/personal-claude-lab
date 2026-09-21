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

/** RM 24.00. Each venue carries its own currency code; MYR gets the symbol. */
export function formatMoney(value: number | null | undefined, currency = CURRENCY): string | null {
  if (value == null) return null;
  return `${currency === "MYR" ? "RM" : currency} ${Number(value).toFixed(2)}`;
}

/**
 * "RM 50.00–70.00". Used where a price is a range rather than a number — an
 * off-peak and a peak rate for the same court. Ordered defensively: a venue
 * whose "peak" is cheaper than its base rate is a data-entry slip, not a reason
 * to print a backwards range.
 */
export function formatMoneyRange(
  a: number,
  b: number,
  currency = CURRENCY,
): string | null {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  if (low === high) return formatMoney(low, currency);
  const highText = formatMoney(high, currency)!;
  // The unit is already on the low end; repeating it reads as two prices.
  return `${formatMoney(low, currency)}–${highText.slice(highText.indexOf(" ") + 1)}`;
}

/**
 * The polled window as a person would say it: "Sun 13 Sep", or
 * "Sat 12 – Sun 13 Sep" across days, or both months when it straddles one.
 *
 * A poll's dates used to print raw — "2026-09-13 to 2026-09-13" — which says
 * the same date twice, in a format nobody speaks, on the screen and in the
 * WhatsApp message that friends actually read.
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const a = formatDayHeader(startDate);
  if (startDate === endDate) return `${a.weekday} ${a.dayOfMonth} ${a.month}`;
  const b = formatDayHeader(endDate);
  return a.month === b.month
    ? `${a.weekday} ${a.dayOfMonth} – ${b.weekday} ${b.dayOfMonth} ${b.month}`
    : `${a.weekday} ${a.dayOfMonth} ${a.month} – ${b.weekday} ${b.dayOfMonth} ${b.month}`;
}

export interface BookingWindow {
  /** KL date the platform starts accepting this booking, YYYY-MM-DD. */
  opensOn: string;
  /** Whether that day has arrived. */
  isOpen: boolean;
  /** Whole KL days until it does. Zero once open. */
  daysAway: number;
}

/**
 * A venue that takes bookings N days ahead opens this session's slot N days
 * before it — which is the single fact that decides whether the host acts now
 * or sets a reminder, and it was previously left as "opens 7d ahead" for them
 * to work out against a date on another part of the screen.
 *
 * Compared in whole KL days, not instants: a window that opens today is open at
 * 09:00, not only once the clock passes the session's own start time.
 */
export function bookingWindow(
  confirmedStart: Date,
  daysAhead: number,
  now = new Date(),
): BookingWindow {
  const opensOn = shiftDate(instantToKl(confirmedStart).date, -Math.max(0, daysAhead));
  const today = instantToKl(now).date;
  const daysAway = Math.round(
    (Date.parse(`${opensOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS,
  );
  return { opensOn, isOpen: daysAway <= 0, daysAway: Math.max(0, daysAway) };
}

export function formatDuration(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60}hr`;
  return `${Math.floor(minutes / 60)}hr ${minutes % 60}min`;
}

export type Granularity = "time" | "date";

export const DAY_MINUTES = 24 * 60;

/**
 * One window of time on one KL date.
 *
 * This replaced a single day_start_time/day_end_time pair on the poll itself.
 * A poll is no longer a rectangle of dates x times: the host picks the dates
 * individually and gives each one its own windows, so Saturday can be a
 * morning and Tuesday an evening, and a date can carry more than one window.
 *
 * `startTime` and `endTime` are both null on a whole-date window — the trip
 * case, where the question is which DAYS suit and the time of day is not being
 * asked at all.
 */
export interface PollWindow {
  /** KL date this window belongs to, YYYY-MM-DD. */
  date: string;
  /** HH:MM, or null for a whole-date window. */
  startTime: string | null;
  /** HH:MM, or null. At or before startTime means the NEXT day. */
  endTime: string | null;
}

export interface SlotGridSpec {
  /**
   * "time" polls windows of times on each picked date. "date" asks only which
   * whole days suit — the trip case — and produces one slot per date, at
   * midnight KL. The quorum engine is unchanged either way: a run of
   * consecutive day-slots is the same question as a run of consecutive hours.
   */
  granularity?: Granularity;
  /** One size for the whole poll. The engine's contiguity test assumes it. */
  slotMinutes: number;
  windows: PollWindow[];
}

/**
 * A window normalised to minutes from midnight KL of its own date.
 *
 * `endMinutes` may exceed 1440: a 22:00-02:00 window is 1320 -> 1560, which is
 * what keeps an overnight session a four-hour stretch rather than a negative
 * one. Only equality is meaningless, and the form rejects it.
 */
export interface NormalisedWindow {
  date: string;
  startMinutes: number;
  endMinutes: number;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const wrapped = ((mins % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/**
 * Fold a date's windows into the smallest set that covers the same time.
 *
 * Overlapping windows on one date — 18:00-22:00 alongside 20:00-23:00 — are
 * what a host produces when they add a second window without checking the
 * first. Merging says what they meant (18:00-23:00) and, more importantly,
 * keeps the slot set free of duplicates: the same instant emitted twice would
 * be inserted twice into `availability` and counted twice by the heatmap.
 *
 * Touching windows merge too. 18:00-20:00 followed by 20:00-22:00 is one
 * continuous stretch, and drawing a gap between them would tell a friend there
 * is a break in the evening that does not exist.
 *
 * Done here rather than in the database so the host's list survives as they
 * typed it — the rows stay, only the derived grid is normalised.
 */
export function mergeWindows(windows: PollWindow[]): NormalisedWindow[] {
  const byDate = new Map<string, NormalisedWindow[]>();

  for (const w of windows) {
    // A whole-date window has no times to merge; it is handled by the date
    // branch of buildSlotGrid and would normalise to a zero-length range here.
    if (w.startTime == null || w.endTime == null) continue;
    const startMinutes = toMinutes(w.startTime);
    let endMinutes = toMinutes(w.endTime);
    // An end at or before the start means the window runs into the next day.
    if (endMinutes <= startMinutes) endMinutes += MINUTES_PER_DAY;
    const list = byDate.get(w.date) ?? [];
    list.push({ date: w.date, startMinutes, endMinutes });
    byDate.set(w.date, list);
  }

  const out: NormalisedWindow[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const sorted = byDate.get(date)!.sort((a, b) => a.startMinutes - b.startMinutes);
    let current: NormalisedWindow | null = null;
    for (const w of sorted) {
      if (current && w.startMinutes <= current.endMinutes) {
        current.endMinutes = Math.max(current.endMinutes, w.endMinutes);
        continue;
      }
      current = { ...w };
      out.push(current);
    }
  }
  return out;
}

/** Every date the poll asks about, ascending and deduped. */
export function pollDates(windows: PollWindow[]): string[] {
  return [...new Set(windows.map((w) => w.date))].sort();
}

/**
 * `poll_windows` rows -> grid windows.
 *
 * Structurally typed rather than importing the row type, so this module stays
 * pure. Postgres hands back a `time` as "18:00:00" and every comparison and
 * label here is written against "18:00", so the seconds are trimmed once, at
 * the boundary, instead of at each of the half-dozen places that would
 * otherwise have to remember to.
 */
export function windowsFromRows(
  rows: { day_date: string; start_time: string | null; end_time: string | null }[],
): PollWindow[] {
  return rows.map((row) => ({
    date: row.day_date,
    startTime: row.start_time ? row.start_time.slice(0, 5) : null,
    endTime: row.end_time ? row.end_time.slice(0, 5) : null,
  }));
}

/**
 * One cell of a date's column.
 *
 * "gap" is a spacer drawn between two windows on the same date, so a friend
 * can see that Saturday morning and Saturday evening are separate stretches
 * rather than one continuous run of hours. "pad" fills the bottom of a column
 * shorter than the tallest one — columns no longer share a time axis, so they
 * no longer share a height either.
 */
export type GridCell =
  | {
      kind: "slot";
      /** Start, HH:MM. The prominent half of the cell's label. */
      time: string;
      /**
       * End, HH:MM. Carried separately rather than split back out of `label`
       * so the two halves can be styled differently: the grid sets the start
       * at full strength and the end faded, which keeps a column scannable by
       * start time while still saying what each block actually covers.
       */
      endTime: string;
      /** "18:00–19:00" — the whole range, for aria-labels and titles. */
      label: string;
      start: Date;
    }
  | { kind: "gap" }
  | { kind: "pad" };

export interface DayColumn {
  /** KL date, YYYY-MM-DD. */
  date: string;
  /** Padded to SlotGrid.rows, so every column renders the same table height. */
  cells: GridCell[];
}

export interface SlotGrid {
  /** One per polled date, ascending. */
  columns: DayColumn[];
  /** Every polled instant, deduped and ascending. Validation reads this. */
  slots: Date[];
  /** Height every column is padded to. */
  rows: number;
}

/**
 * Every slot being polled, as one column per picked date.
 *
 * This used to return a rectangular times x days matrix, because every day was
 * polled over the same window. Dates now carry their own windows, so the
 * columns are ragged and there is no shared time axis: row 3 of Monday and row
 * 3 of Saturday are different hours, which is why each slot cell carries its
 * own label rather than reading one from a row header.
 */
export function buildSlotGrid(spec: SlotGridSpec): SlotGrid {
  const dates = pollDates(spec.windows);

  // A date poll has exactly one slot per date, anchored at midnight KL. Dates
  // are a fixed 24h apart (Malaysia has no DST), so consecutive dates are
  // contiguous by the same arithmetic the engine already uses for half-hours —
  // and two dates the host did NOT pick consecutively are correctly not.
  if (spec.granularity === "date") {
    const columns = dates.map((date) => ({
      date,
      cells: [
        {
          kind: "slot" as const,
          time: "00:00",
          endTime: "00:00",
          label: "",
          start: klToInstant(date, "00:00"),
        },
      ],
    }));
    return {
      columns,
      slots: dates.map((date) => klToInstant(date, "00:00")),
      rows: columns.length ? 1 : 0,
    };
  }

  const merged = mergeWindows(spec.windows);
  const byDate = new Map<string, NormalisedWindow[]>();
  for (const w of merged) byDate.set(w.date, [...(byDate.get(w.date) ?? []), w]);

  const columns: DayColumn[] = dates.map((date) => {
    const cells: GridCell[] = [];
    const windows = byDate.get(date) ?? [];

    windows.forEach((window, i) => {
      // Windows arrive sorted and already merged, so anything still separate is
      // a genuine break in the day and gets a visible spacer.
      if (i > 0) cells.push({ kind: "gap" });

      for (
        let mins = window.startMinutes;
        mins + spec.slotMinutes <= window.endMinutes;
        mins += spec.slotMinutes
      ) {
        const time = minutesToTime(mins);
        cells.push({
          kind: "slot",
          time,
          endTime: minutesToTime(mins + spec.slotMinutes),
          label: formatSlotRange(time, spec.slotMinutes),
          // Minutes past 1440 belong to the following calendar day, but stay
          // in THIS date's column: 00:30 under "Mon 22" is the small hours of
          // Tuesday, reached by staying out late on Monday.
          start: new Date(
            klToInstant(date, time).getTime() +
              Math.floor(mins / MINUTES_PER_DAY) * DAY_MS,
          ),
        });
      }
    });

    return { date, cells };
  });

  const rows = Math.max(0, ...columns.map((c) => c.cells.length));
  for (const column of columns) {
    while (column.cells.length < rows) column.cells.push({ kind: "pad" });
  }

  const slots = [
    ...new Set(
      columns.flatMap((c) =>
        c.cells.flatMap((cell) => (cell.kind === "slot" ? [cell.start.getTime()] : [])),
      ),
    ),
  ]
    .sort((a, b) => a - b)
    .map((ms) => new Date(ms));

  return { columns, slots, rows };
}

/** Whether a list of ascending dates has no gaps in it. */
export function datesAreContiguous(dates: string[]): boolean {
  for (let i = 1; i < dates.length; i++) {
    if (shiftDate(dates[i - 1], 1) !== dates[i]) return false;
  }
  return true;
}

/**
 * The polled dates as a person would say them.
 *
 * `formatDateRange` was enough while a poll was a contiguous window, but the
 * host now picks dates individually: printing "Mon 22 Sep – Fri 3 Oct" for
 * three picked Tuesdays would claim twelve days the poll never asked about,
 * on the share link and in the WhatsApp message friends actually read.
 *
 * A contiguous run still prints as a range, because that is how people say it.
 * A handful of scattered dates are listed outright. Past four, a list stops
 * being readable — especially inside a link preview — so it becomes a count
 * with its outer bounds, which is honest about being a summary.
 */
export function formatDateList(dates: string[]): string {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length === 0) return "No dates";
  if (sorted.length === 1 || datesAreContiguous(sorted)) {
    return formatDateRange(sorted[0], sorted[sorted.length - 1]);
  }
  if (sorted.length > 4) {
    return `${sorted.length} dates between ${formatDateRange(
      sorted[0],
      sorted[0],
    )} and ${formatDateRange(sorted[sorted.length - 1], sorted[sorted.length - 1])}`;
  }

  const parts = sorted.map((d) => formatDayHeader(d));
  return parts
    .map((p, i) => {
      // The month rides on the last date, and on any date whose month differs
      // from the one after it — so "Mon 28 Sep, Thu 1 & Sat 3 Oct" names each
      // month exactly where it changes rather than on every entry.
      const last = i === parts.length - 1;
      const showMonth = last || p.month !== parts[i + 1].month;
      const text = `${p.weekday} ${p.dayOfMonth}${showMonth ? ` ${p.month}` : ""}`;
      if (i === 0) return text;
      return `${last ? " & " : ", "}${text}`;
    })
    .join("");
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

/** "3 days" / "1 day" — durations on a date poll read in days, not hours. */
export function formatDays(minutes: number): string {
  const days = Math.round(minutes / DAY_MINUTES);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * A booking span on a date poll: "Fri 11 – Sun 13 Sep", or a single date.
 *
 * Deliberately inclusive of the last day. A 3-day trip starting Friday runs
 * Friday, Saturday, Sunday — saying "to Monday" would be arithmetic leaking
 * into something people read as a plan.
 */
export function formatDateSpan(start: Date, minutes: number): string {
  const days = Math.max(1, Math.round(minutes / DAY_MINUTES));
  const a = formatDayHeader(instantToKl(start).date);
  if (days === 1) return `${a.weekday} ${a.dayOfMonth} ${a.month}`;
  const lastInstant = new Date(start.getTime() + (days - 1) * 24 * 60 * MINUTE_MS);
  const b = formatDayHeader(instantToKl(lastInstant).date);
  return a.month === b.month
    ? `${a.weekday} ${a.dayOfMonth} – ${b.weekday} ${b.dayOfMonth} ${b.month}`
    : `${a.weekday} ${a.dayOfMonth} ${a.month} – ${b.weekday} ${b.dayOfMonth} ${b.month}`;
}
