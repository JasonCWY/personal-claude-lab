import { describe, expect, it } from "vitest";
import {
  bookingWindow,
  buildSlotGrid,
  formatDateRange,
  DAY_MINUTES,
  formatDateSpan,
  formatDays,
  formatDayHeader,
  formatSlotRange,
  formatSpan,
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

describe("buildSlotGrid", () => {
  it("builds a times x days grid over the polled window", () => {
    const grid = buildSlotGrid({
      pollStartDate: "2026-09-09",
      pollEndDate: "2026-09-11",
      dayStartTime: "19:00",
      dayEndTime: "21:00",
      slotMinutes: 30,
    });

    expect(grid.days).toEqual(["2026-09-09", "2026-09-10", "2026-09-11"]);
    expect(grid.times).toEqual(["19:00", "19:30", "20:00", "20:30"]);
    expect(grid.grid).toHaveLength(4);
    expect(grid.grid[0]).toHaveLength(3);
    expect(grid.grid[0][0]).toEqual(klToInstant("2026-09-09", "19:00"));
  });

  it("excludes a trailing slot that would run past the end time", () => {
    // 19:00-20:00 at 30min gives 19:00 and 19:30 — not 20:00, which would end at 20:30.
    const grid = buildSlotGrid({
      pollStartDate: "2026-09-09",
      pollEndDate: "2026-09-09",
      dayStartTime: "19:00",
      dayEndTime: "20:00",
      slotMinutes: 30,
    });
    expect(grid.times).toEqual(["19:00", "19:30"]);
  });

  it("handles a single-day poll", () => {
    const grid = buildSlotGrid({
      pollStartDate: "2026-09-09",
      pollEndDate: "2026-09-09",
      dayStartTime: "18:00",
      dayEndTime: "22:00",
      slotMinutes: 60,
    });
    expect(grid.days).toEqual(["2026-09-09"]);
    expect(grid.times).toEqual(["18:00", "19:00", "20:00", "21:00"]);
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
      pollStartDate: "2026-09-14",
      pollEndDate: "2026-09-14",
      dayStartTime: "22:00",
      dayEndTime: "00:00",
      slotMinutes: 30,
    });
    expect(grid.times).toEqual(["22:00", "22:30", "23:00", "23:30"]);
    expect(grid.grid[0][0].toISOString()).toBe("2026-09-14T14:00:00.000Z"); // 22:00 KL
    expect(grid.grid[3][0].toISOString()).toBe("2026-09-14T15:30:00.000Z"); // 23:30 KL
  });

  it("rolls slots past midnight onto the next calendar day", () => {
    const grid = buildSlotGrid({
      pollStartDate: "2026-09-14",
      pollEndDate: "2026-09-14",
      dayStartTime: "23:00",
      dayEndTime: "01:00",
      slotMinutes: 30,
    });
    expect(grid.times).toEqual(["23:00", "23:30", "00:00", "00:30"]);
    // 00:00 KL on the 15th is 16:00 UTC on the 14th.
    expect(instantToKl(grid.grid[2][0]).date).toBe("2026-09-15");
    expect(instantToKl(grid.grid[2][0]).time).toBe("00:00");
  });

  it("keeps overnight slots contiguous so a window can span midnight", () => {
    const grid = buildSlotGrid({
      pollStartDate: "2026-09-14",
      pollEndDate: "2026-09-14",
      dayStartTime: "23:00",
      dayEndTime: "01:00",
      slotMinutes: 30,
    });
    const starts = grid.grid.map((row) => row[0].getTime());
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBe(30 * 60_000);
    }
  });

  it("still produces a plain same-day grid when the end is after the start", () => {
    const grid = buildSlotGrid({
      pollStartDate: "2026-09-14",
      pollEndDate: "2026-09-14",
      dayStartTime: "18:00",
      dayEndTime: "20:00",
      slotMinutes: 60,
    });
    expect(grid.times).toEqual(["18:00", "19:00"]);
    expect(instantToKl(grid.grid[1][0]).date).toBe("2026-09-14");
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
  const spec = {
    pollStartDate: "2026-09-11",
    pollEndDate: "2026-09-15",
    granularity: "date" as const,
    dayStartTime: "00:00",
    dayEndTime: "00:00",
    slotMinutes: DAY_MINUTES,
  };

  it("produces exactly one slot per day", () => {
    const grid = buildSlotGrid(spec);
    expect(grid.days).toEqual([
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
    ]);
    expect(grid.times).toEqual(["00:00"]);
    expect(grid.grid).toHaveLength(1);
    expect(grid.grid[0]).toHaveLength(5);
  });

  it("anchors each slot at midnight Kuala Lumpur", () => {
    const grid = buildSlotGrid(spec);
    expect(grid.grid[0][0]).toEqual(klToInstant("2026-09-11", "00:00"));
    expect(instantToKl(grid.grid[0][2]).time).toBe("00:00");
  });

  it("keeps consecutive days exactly one slot-step apart", () => {
    // This is what lets the quorum engine find a run of days with no changes:
    // its contiguity check is slotKeys[i+k] === start + k * step.
    const row = buildSlotGrid(spec).grid[0].map((d) => d.getTime());
    for (let i = 1; i < row.length; i++) {
      expect(row[i] - row[i - 1]).toBe(DAY_MINUTES * 60_000);
    }
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
