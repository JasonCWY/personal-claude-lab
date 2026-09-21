import { describe, expect, it } from "vitest";
import {
  bookingWindow,
  buildSlotGrid,
  datesAreContiguous,
  formatDateList,
  formatDateRange,
  DAY_MINUTES,
  formatDateSpan,
  formatDays,
  formatDayHeader,
  formatSlotRange,
  formatSpan,
  mergeWindows,
  pollDates,
  spansMonths,
  defaultPollRange,
  formatDuration,
  formatKl,
  formatMoney,
  formatMoneyRange,
  instantToKl,
  klToInstant,
  shiftDate,
} from "@/lib/slots";
import type { GridCell } from "@/lib/slots";

describe("Kuala Lumpur time conversion", () => {
  it("treats wall-clock input as UTC+8", () => {
    // 19:00 in KL is 11:00 UTC.
    expect(klToInstant("2026-09-09", "19:00").toISOString()).toBe("2026-09-09T11:00:00.000Z");
  });

  it("round-trips an instant back to the same wall clock", () => {
    const instant = klToInstant("2026-09-09", "19:30");
    expect(instantToKl(instant)).toEqual({
      date: "2026-09-09",
      time: "19:30",
      weekday: "Wed",
      dayOfMonth: 9,
    });
  });

  it("handles a slot that crosses midnight UTC without shifting the KL date", () => {
    // 07:00 KL is 23:00 UTC the previous day.
    const instant = klToInstant("2026-09-09", "07:00");
    expect(instant.toISOString()).toBe("2026-09-08T23:00:00.000Z");
    expect(instantToKl(instant).date).toBe("2026-09-09");
  });

  it("formats for display", () => {
    expect(formatKl(klToInstant("2026-09-09", "19:00"))).toBe("Wed 9 Sep, 19:00");
  });
});

describe("formatDuration", () => {
  it("renders whole hours and part hours", () => {
    expect(formatDuration(60)).toBe("1hr");
    expect(formatDuration(120)).toBe("2hr");
    expect(formatDuration(90)).toBe("1hr 30min");
  });
});

/** The slot times of one column, in order. Gaps and padding are ignored. */
function slotTimes(column: { cells: GridCell[] }): string[] {
  return column.cells.flatMap((c) => (c.kind === "slot" ? [c.time] : []));
}

/** The cell kinds of one column, so a gap's POSITION can be asserted. */
function kinds(column: { cells: GridCell[] }): string[] {
  return column.cells.map((c) => c.kind);
}

const evening = (date: string) => ({ date, startTime: "19:00", endTime: "21:00" });

describe("buildSlotGrid", () => {
  it("builds one column per picked date", () => {
    const grid = buildSlotGrid({
      slotMinutes: 30,
      windows: ["2026-09-09", "2026-09-10", "2026-09-11"].map(evening),
    });

    expect(grid.columns.map((c) => c.date)).toEqual([
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
    ]);
    expect(slotTimes(grid.columns[0])).toEqual(["19:00", "19:30", "20:00", "20:30"]);
    expect(grid.rows).toBe(4);
    expect(grid.columns[0].cells[0]).toMatchObject({
      kind: "slot",
      start: klToInstant("2026-09-09", "19:00"),
    });
  });

  it("gives each date its own window rather than one shared axis", () => {
    // The whole point of the change: Saturday is a morning, Tuesday an evening.
    const grid = buildSlotGrid({
      slotMinutes: 60,
      windows: [
        { date: "2026-09-22", startTime: "18:00", endTime: "22:00" },
        { date: "2026-09-26", startTime: "09:00", endTime: "12:00" },
      ],
    });

    expect(slotTimes(grid.columns[0])).toEqual(["18:00", "19:00", "20:00", "21:00"]);
    expect(slotTimes(grid.columns[1])).toEqual(["09:00", "10:00", "11:00"]);
  });

  it("pads the short column so every column renders the same height", () => {
    const grid = buildSlotGrid({
      slotMinutes: 60,
      windows: [
        { date: "2026-09-22", startTime: "18:00", endTime: "22:00" },
        { date: "2026-09-26", startTime: "09:00", endTime: "11:00" },
      ],
    });

    expect(grid.rows).toBe(4);
    expect(grid.columns.every((c) => c.cells.length === 4)).toBe(true);
    expect(kinds(grid.columns[1])).toEqual(["slot", "slot", "pad", "pad"]);
  });

  it("draws a gap between two separate windows on the same date", () => {
    const grid = buildSlotGrid({
      slotMinutes: 60,
      windows: [
        { date: "2026-09-26", startTime: "09:00", endTime: "12:00" },
        { date: "2026-09-26", startTime: "20:00", endTime: "22:00" },
      ],
    });

    expect(grid.columns).toHaveLength(1);
    expect(kinds(grid.columns[0])).toEqual([
      "slot", "slot", "slot", "gap", "slot", "slot",
    ]);
    expect(slotTimes(grid.columns[0])).toEqual([
      "09:00", "10:00", "11:00", "20:00", "21:00",
    ]);
  });

  it("carries each slot's end time, so a cell can show its whole range", () => {
    // A bare start cannot say what a cell covers: whether "18:00" is an hour
    // or a half depends on a slot size stated nowhere on the friend page.
    const hourly = buildSlotGrid({
      slotMinutes: 60,
      windows: [{ date: "2026-09-22", startTime: "18:00", endTime: "20:00" }],
    });
    expect(hourly.columns[0].cells).toMatchObject([
      { kind: "slot", time: "18:00", endTime: "19:00", label: "18:00–19:00" },
      { kind: "slot", time: "19:00", endTime: "20:00", label: "19:00–20:00" },
    ]);

    const half = buildSlotGrid({
      slotMinutes: 30,
      windows: [{ date: "2026-09-22", startTime: "18:00", endTime: "19:00" }],
    });
    expect(half.columns[0].cells).toMatchObject([
      { kind: "slot", time: "18:00", endTime: "18:30" },
      { kind: "slot", time: "18:30", endTime: "19:00" },
    ]);
  });

  it("wraps a slot's end time across midnight rather than printing 24:00", () => {
    const grid = buildSlotGrid({
      slotMinutes: 60,
      windows: [{ date: "2026-09-22", startTime: "23:00", endTime: "01:00" }],
    });
    expect(grid.columns[0].cells).toMatchObject([
      { kind: "slot", time: "23:00", endTime: "00:00" },
      { kind: "slot", time: "00:00", endTime: "01:00" },
    ]);
  });

  it("excludes a trailing slot that would run past the end time", () => {
    // 19:00-20:00 at 30min gives 19:00 and 19:30 — not 20:00, which would end at 20:30.
    const grid = buildSlotGrid({
      slotMinutes: 30,
      windows: [{ date: "2026-09-09", startTime: "19:00", endTime: "20:00" }],
    });
    expect(slotTimes(grid.columns[0])).toEqual(["19:00", "19:30"]);
  });

  it("reports every polled instant once, ascending, for validation", () => {
    const grid = buildSlotGrid({
      slotMinutes: 60,
      windows: [
        { date: "2026-09-26", startTime: "20:00", endTime: "22:00" },
        { date: "2026-09-22", startTime: "18:00", endTime: "20:00" },
      ],
    });

    expect(grid.slots.map((d) => d.getTime())).toEqual([
      klToInstant("2026-09-22", "18:00").getTime(),
      klToInstant("2026-09-22", "19:00").getTime(),
      klToInstant("2026-09-26", "20:00").getTime(),
      klToInstant("2026-09-26", "21:00").getTime(),
    ]);
  });

  it("has nothing to show for a poll with no dates yet", () => {
    const grid = buildSlotGrid({ slotMinutes: 60, windows: [] });
    expect(grid.columns).toEqual([]);
    expect(grid.slots).toEqual([]);
    expect(grid.rows).toBe(0);
  });
});

describe("mergeWindows", () => {
  it("merges two overlapping windows on the same date", () => {
    // The host added an evening window without noticing the first one.
    expect(
      mergeWindows([
        { date: "2026-09-26", startTime: "18:00", endTime: "22:00" },
        { date: "2026-09-26", startTime: "20:00", endTime: "23:00" },
      ]),
    ).toEqual([{ date: "2026-09-26", startMinutes: 18 * 60, endMinutes: 23 * 60 }]);
  });

  it("merges windows that merely touch, so no false gap is drawn", () => {
    expect(
      mergeWindows([
        { date: "2026-09-26", startTime: "18:00", endTime: "20:00" },
        { date: "2026-09-26", startTime: "20:00", endTime: "22:00" },
      ]),
    ).toEqual([{ date: "2026-09-26", startMinutes: 18 * 60, endMinutes: 22 * 60 }]);
  });

  it("leaves a genuine break in the day as two windows", () => {
    expect(
      mergeWindows([
        { date: "2026-09-26", startTime: "20:00", endTime: "22:00" },
        { date: "2026-09-26", startTime: "09:00", endTime: "12:00" },
      ]),
    ).toEqual([
      { date: "2026-09-26", startMinutes: 9 * 60, endMinutes: 12 * 60 },
      { date: "2026-09-26", startMinutes: 20 * 60, endMinutes: 22 * 60 },
    ]);
  });

  it("never merges across dates", () => {
    const merged = mergeWindows([
      { date: "2026-09-26", startTime: "18:00", endTime: "22:00" },
      { date: "2026-09-27", startTime: "18:00", endTime: "22:00" },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((w) => w.date)).toEqual(["2026-09-26", "2026-09-27"]);
  });

  it("dedupes an exact duplicate rather than emitting the slot twice", () => {
    // A duplicated instant would be inserted twice into `availability` and
    // counted twice by the heatmap.
    expect(
      mergeWindows([
        { date: "2026-09-26", startTime: "18:00", endTime: "22:00" },
        { date: "2026-09-26", startTime: "18:00", endTime: "22:00" },
      ]),
    ).toHaveLength(1);
  });

  it("reads an end at or before the start as the next day", () => {
    expect(
      mergeWindows([{ date: "2026-09-26", startTime: "22:00", endTime: "02:00" }]),
    ).toEqual([{ date: "2026-09-26", startMinutes: 22 * 60, endMinutes: 26 * 60 }]);
  });

  it("ignores whole-date windows, which carry no times to merge", () => {
    expect(
      mergeWindows([{ date: "2026-09-26", startTime: null, endTime: null }]),
    ).toEqual([]);
  });
});

describe("shiftDate", () => {
  it("shifts forward a week for duplicate-session", () => {
    expect(shiftDate("2026-09-09", 7)).toBe("2026-09-16");
  });

  it("crosses a month boundary", () => {
    expect(shiftDate("2026-09-28", 7)).toBe("2026-10-05");
  });

  it("crosses a leap day", () => {
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("defaultPollRange", () => {
  it("covers the seven days starting tomorrow, in KL terms", () => {
    // 2026-09-09T20:00Z is already 2026-09-10 in KL, so "tomorrow" is the 11th.
    expect(defaultPollRange(new Date("2026-09-09T20:00:00Z"))).toEqual({
      start: "2026-09-11",
      end: "2026-09-17",
    });
  });
});

describe("buildSlotGrid across midnight", () => {
  it("treats an end of 00:00 as the end of the same evening", () => {
    // The case that motivated this: a 10pm-12am session. Nothing rolls over —
    // the last slot that fits starts at 23:30.
    const grid = buildSlotGrid({
      slotMinutes: 30,
      windows: [{ date: "2026-09-14", startTime: "22:00", endTime: "00:00" }],
    });
    expect(slotTimes(grid.columns[0])).toEqual(["22:00", "22:30", "23:00", "23:30"]);
    const cells = grid.columns[0].cells;
    expect((cells[0] as { start: Date }).start.toISOString()).toBe("2026-09-14T14:00:00.000Z");
    expect((cells[3] as { start: Date }).start.toISOString()).toBe("2026-09-14T15:30:00.000Z");
  });

  it("rolls slots past midnight onto the next calendar day, in the SAME column", () => {
    // 00:30 under "Mon 14" is the small hours of Tuesday, reached by staying
    // out late on Monday — so it belongs to Monday's column, not Tuesday's.
    const grid = buildSlotGrid({
      slotMinutes: 30,
      windows: [{ date: "2026-09-14", startTime: "23:00", endTime: "01:00" }],
    });
    expect(grid.columns).toHaveLength(1);
    expect(slotTimes(grid.columns[0])).toEqual(["23:00", "23:30", "00:00", "00:30"]);
    const third = (grid.columns[0].cells[2] as { start: Date }).start;
    expect(instantToKl(third).date).toBe("2026-09-15");
    expect(instantToKl(third).time).toBe("00:00");
  });

  it("keeps overnight slots contiguous so a window can span midnight", () => {
    const grid = buildSlotGrid({
      slotMinutes: 30,
      windows: [{ date: "2026-09-14", startTime: "23:00", endTime: "01:00" }],
    });
    const starts = grid.slots.map((d) => d.getTime());
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBe(30 * 60_000);
    }
  });

  it("still produces a plain same-day column when the end is after the start", () => {
    const grid = buildSlotGrid({
      slotMinutes: 60,
      windows: [{ date: "2026-09-14", startTime: "18:00", endTime: "20:00" }],
    });
    expect(slotTimes(grid.columns[0])).toEqual(["18:00", "19:00"]);
    expect(instantToKl(grid.slots[1]).date).toBe("2026-09-14");
  });
});

describe("grid display helpers", () => {
  it("puts the month in the day header", () => {
    expect(formatDayHeader("2026-09-14")).toEqual({
      weekday: "Mon",
      dayOfMonth: 14,
      month: "Sep",
    });
  });

  it("notices a poll that straddles a month boundary", () => {
    expect(spansMonths(["2026-09-29", "2026-09-30", "2026-10-01"])).toBe(true);
    expect(spansMonths(["2026-09-14", "2026-09-15"])).toBe(false);
  });

  it("labels a slot as a range, not a bare start", () => {
    expect(formatSlotRange("19:00", 30)).toBe("19:00–19:30");
    expect(formatSlotRange("23:30", 30)).toBe("23:30–00:00");
    expect(formatSlotRange("19:00", 60)).toBe("19:00–20:00");
  });

  it("formats a booking span", () => {
    expect(formatSpan(klToInstant("2026-09-15", "19:00"), 120)).toBe(
      "Tue 15 Sep, 19:00 – 21:00",
    );
  });

  it("flags a span that finishes the next day", () => {
    expect(formatSpan(klToInstant("2026-09-15", "23:00"), 120)).toContain("(next day)");
  });
});

describe("date-only polls", () => {
  const wholeDates = (dates: string[]) =>
    dates.map((date) => ({ date, startTime: null, endTime: null }));

  const spec = {
    granularity: "date" as const,
    slotMinutes: DAY_MINUTES,
    windows: wholeDates([
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
    ]),
  };

  it("produces exactly one slot per picked date", () => {
    const grid = buildSlotGrid(spec);
    expect(grid.columns.map((c) => c.date)).toEqual([
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
    ]);
    expect(grid.rows).toBe(1);
    expect(grid.columns.every((c) => c.cells.length === 1)).toBe(true);
    expect(grid.slots).toHaveLength(5);
  });

  it("anchors each slot at midnight Kuala Lumpur", () => {
    const grid = buildSlotGrid(spec);
    expect(grid.slots[0]).toEqual(klToInstant("2026-09-11", "00:00"));
    expect(instantToKl(grid.slots[2]).time).toBe("00:00");
  });

  it("keeps consecutive days exactly one slot-step apart", () => {
    // This is what lets the quorum engine find a run of days with no changes:
    // its contiguity check is slotKeys[i+k] === start + k * step.
    const row = buildSlotGrid(spec).slots.map((d) => d.getTime());
    for (let i = 1; i < row.length; i++) {
      expect(row[i] - row[i - 1]).toBe(DAY_MINUTES * 60_000);
    }
  });

  it("leaves a skipped date as a real break in the run", () => {
    // Picking Fri and Sun but not Sat must NOT read as a 3-day trip. The
    // engine's contiguity test is what enforces that, and it can only do so
    // because the missing day produces no slot at all.
    const row = buildSlotGrid({
      granularity: "date",
      slotMinutes: DAY_MINUTES,
      windows: wholeDates(["2026-09-11", "2026-09-13"]),
    }).slots.map((d) => d.getTime());
    expect(row[1] - row[0]).toBe(2 * DAY_MINUTES * 60_000);
  });

  it("reads durations in days", () => {
    expect(formatDays(DAY_MINUTES)).toBe("1 day");
    expect(formatDays(3 * DAY_MINUTES)).toBe("3 days");
  });

  it("describes a multi-day span inclusively", () => {
    // A 3-day trip from Friday runs Fri, Sat, Sun — not "to Monday".
    expect(formatDateSpan(klToInstant("2026-09-11", "00:00"), 3 * DAY_MINUTES)).toBe(
      "Fri 11 – Sun 13 Sep",
    );
    expect(formatDateSpan(klToInstant("2026-09-11", "00:00"), DAY_MINUTES)).toBe("Fri 11 Sep");
  });

  it("names both months when a span crosses one", () => {
    expect(formatDateSpan(klToInstant("2026-09-29", "00:00"), 4 * DAY_MINUTES)).toBe(
      "Tue 29 Sep – Fri 2 Oct",
    );
  });
});

describe("booking window", () => {
  const session = klToInstant("2026-09-20", "19:00");

  it("opens the venue's lead time before the session day", () => {
    const w = bookingWindow(session, 7, klToInstant("2026-09-10", "12:00"));
    expect(w.opensOn).toBe("2026-09-13");
    expect(w.isOpen).toBe(false);
    expect(w.daysAway).toBe(3);
  });

  it("counts the opening day itself as open, from midnight KL", () => {
    // 09:00 on the 13th is inside the window even though the session is at
    // 19:00 — the platform opens the day, not the hour.
    const w = bookingWindow(session, 7, klToInstant("2026-09-13", "09:00"));
    expect(w.isOpen).toBe(true);
    expect(w.daysAway).toBe(0);
  });

  it("stays open once the window has passed", () => {
    expect(bookingWindow(session, 7, klToInstant("2026-09-18", "09:00")).isOpen).toBe(true);
  });

  it("treats a zero lead time as open on the day", () => {
    const w = bookingWindow(session, 0, klToInstant("2026-09-19", "23:00"));
    expect(w.opensOn).toBe("2026-09-20");
    expect(w.isOpen).toBe(false);
    expect(w.daysAway).toBe(1);
  });

  it("crosses a month boundary backwards", () => {
    expect(bookingWindow(klToInstant("2026-10-02", "19:00"), 14).opensOn).toBe("2026-09-18");
  });

  it("uses KL days, not UTC ones", () => {
    // 00:30 KL on the 20th is still the 19th in UTC. The window is a KL fact.
    expect(bookingWindow(klToInstant("2026-09-20", "00:30"), 7).opensOn).toBe("2026-09-13");
  });
});

describe("money", () => {
  it("shows MYR as RM, to two decimals", () => {
    expect(formatMoney(24, "MYR")).toBe("RM 24.00");
    expect(formatMoney(24.5, "MYR")).toBe("RM 24.50");
  });

  it("falls back to the currency code", () => {
    expect(formatMoney(24, "SGD")).toBe("SGD 24.00");
  });

  it("has nothing to say about an unpriced venue", () => {
    expect(formatMoney(null, "MYR")).toBeNull();
  });
});

describe("price ranges", () => {
  it("quotes a range when a venue has a peak rate", () => {
    expect(formatMoneyRange(50, 70, "MYR")).toBe("RM 50.00–70.00");
  });

  it("collapses to one price when both rates are the same", () => {
    expect(formatMoneyRange(30, 30, "MYR")).toBe("RM 30.00");
  });

  it("orders a backwards pair rather than printing it backwards", () => {
    // A "peak" cheaper than the base rate is a typo in the venue form.
    expect(formatMoneyRange(70, 50, "MYR")).toBe("RM 50.00–70.00");
  });
});

describe("poll date range", () => {
  it("says a single day once, not twice", () => {
    expect(formatDateRange("2026-09-13", "2026-09-13")).toBe("Sun 13 Sep");
  });

  it("names both ends within a month", () => {
    expect(formatDateRange("2026-09-12", "2026-09-13")).toBe("Sat 12 – Sun 13 Sep");
  });

  it("names both months when the window straddles one", () => {
    expect(formatDateRange("2026-09-28", "2026-10-02")).toBe("Mon 28 Sep – Fri 2 Oct");
  });
});

describe("picked dates as a sentence", () => {
  it("collects the distinct dates a set of windows asks about", () => {
    expect(
      pollDates([
        { date: "2026-09-26", startTime: "20:00", endTime: "22:00" },
        { date: "2026-09-22", startTime: "18:00", endTime: "22:00" },
        { date: "2026-09-26", startTime: "09:00", endTime: "12:00" },
      ]),
    ).toEqual(["2026-09-22", "2026-09-26"]);
  });

  it("recognises a run with no gaps", () => {
    expect(datesAreContiguous(["2026-09-22", "2026-09-23", "2026-09-24"])).toBe(true);
    expect(datesAreContiguous(["2026-09-22", "2026-09-24"])).toBe(false);
  });

  it("still prints a contiguous run as a range, because that is how people say it", () => {
    expect(formatDateList(["2026-09-22", "2026-09-23", "2026-09-24"])).toBe(
      "Tue 22 – Thu 24 Sep",
    );
    expect(formatDateList(["2026-09-13"])).toBe("Sun 13 Sep");
  });

  it("lists scattered dates rather than claiming the days between them", () => {
    // The bug this exists to prevent: three picked Tuesdays printing as
    // "Tue 22 Sep – Tue 6 Oct" on the link friends actually read.
    expect(formatDateList(["2026-09-22", "2026-09-24", "2026-09-26"])).toBe(
      "Tue 22, Thu 24 & Sat 26 Sep",
    );
  });

  it("names a month exactly where it changes", () => {
    expect(formatDateList(["2026-09-28", "2026-10-01", "2026-10-03"])).toBe(
      "Mon 28 Sep, Thu 1 & Sat 3 Oct",
    );
  });

  it("summarises once a list stops being readable", () => {
    expect(
      formatDateList([
        "2026-09-22",
        "2026-09-24",
        "2026-09-26",
        "2026-09-29",
        "2026-10-01",
      ]),
    ).toBe("5 dates between Tue 22 Sep and Thu 1 Oct");
  });

  it("says so when nothing is picked yet", () => {
    expect(formatDateList([])).toBe("No dates");
  });
});
