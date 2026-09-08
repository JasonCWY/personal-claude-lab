import { describe, expect, it } from "vitest";
import {
  buildSlotGrid,
  formatDayHeader,
  formatSlotRange,
  formatSpan,
  spansMonths,
  defaultPollRange,
  formatDuration,
  formatKl,
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
