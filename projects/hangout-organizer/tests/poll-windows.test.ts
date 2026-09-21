import { describe, expect, it } from "vitest";
import {
  MAX_DATES,
  MAX_WINDOWS_PER_DATE,
  longestRun,
  parseWindows,
  submittedDates,
  validateWindows,
} from "@/lib/poll-windows";

/** A fixed "now" so "already passed" is a fact and not a function of the clock. */
const NOW = new Date("2026-09-21T04:00:00Z"); // 12:00 KL on 21 Sep
const timePoll = { byDate: false, now: NOW };
const w = (date: string, start: string, end: string) => ({ date, start, end });

describe("parseWindows", () => {
  it("reads the picker's payload", () => {
    expect(
      parseWindows('[{"date":"2026-09-22","start":"18:00","end":"22:00"}]'),
    ).toEqual([{ date: "2026-09-22", start: "18:00", end: "22:00" }]);
  });

  it("treats an empty field as nothing picked, not as broken", () => {
    expect(parseWindows("")).toEqual([]);
  });

  it("reads a date poll's dates, which carry no times", () => {
    expect(parseWindows('[{"date":"2026-09-22"}]')).toEqual([
      { date: "2026-09-22", start: null, end: null },
    ]);
  });

  it("returns null for a payload it cannot read", () => {
    // A broken client, not a host mistake — the caller says so differently.
    expect(parseWindows("{not json")).toBeNull();
    expect(parseWindows('{"date":"2026-09-22"}')).toBeNull(); // not an array
    expect(parseWindows("[42]")).toBeNull();
    expect(parseWindows('[{"start":"18:00"}]')).toBeNull(); // no date
  });

  it("normalises an empty string time to null rather than keeping it", () => {
    expect(parseWindows('[{"date":"2026-09-22","start":"","end":""}]')).toEqual([
      { date: "2026-09-22", start: null, end: null },
    ]);
  });
});

describe("longestRun", () => {
  it("counts consecutive dates, not how many there are", () => {
    expect(longestRun(["2026-09-22", "2026-09-23", "2026-09-24"])).toBe(3);
    // Fri + Sun is two one-day options, not a weekend.
    expect(longestRun(["2026-09-11", "2026-09-13"])).toBe(1);
    expect(longestRun(["2026-09-11", "2026-09-12", "2026-09-15", "2026-09-16", "2026-09-17"])).toBe(3);
  });

  it("crosses a month boundary", () => {
    expect(longestRun(["2026-09-29", "2026-09-30", "2026-10-01"])).toBe(3);
  });

  it("has nothing to measure in an empty list", () => {
    expect(longestRun([])).toBe(0);
  });
});

describe("submittedDates", () => {
  it("dedupes the dates several windows share", () => {
    expect(
      submittedDates([
        w("2026-09-26", "20:00", "22:00"),
        w("2026-09-22", "18:00", "22:00"),
        w("2026-09-26", "09:00", "12:00"),
      ]),
    ).toEqual(["2026-09-22", "2026-09-26"]);
  });
});

describe("validateWindows — the picked dates", () => {
  it("accepts a straightforward poll", () => {
    expect(validateWindows([w("2026-09-22", "18:00", "22:00")], timePoll)).toBeNull();
  });

  it("refuses a poll with no dates on it", () => {
    expect(validateWindows([], timePoll)).toMatch(/Pick at least one date/);
  });

  it("refuses a date that has already passed", () => {
    expect(validateWindows([w("2026-09-20", "18:00", "22:00")], timePoll)).toMatch(
      /already passed/,
    );
  });

  it("allows today, because an evening session is arranged the same afternoon", () => {
    expect(validateWindows([w("2026-09-21", "18:00", "22:00")], timePoll)).toBeNull();
  });

  it("refuses more dates than anyone would answer", () => {
    const many = Array.from({ length: MAX_DATES + 1 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 8, 22) + i * 86_400_000);
      return w(d.toISOString().slice(0, 10), "18:00", "22:00");
    });
    expect(validateWindows(many, timePoll)).toMatch(/Keep it to 60 or fewer/);
  });

  it("refuses something that is not a date", () => {
    expect(validateWindows([w("22 Sep 2026", "18:00", "22:00")], timePoll)).toMatch(
      /not a real date/,
    );
  });

  it("refuses a day that does not exist in that month", () => {
    // Date.parse does not reject these — it rolls them forward. A FUTURE
    // rolled-over date would otherwise reach a Postgres `date` column and come
    // back as a raw range error instead of a sentence.
    expect(validateWindows([w("2026-11-31", "18:00", "22:00")], timePoll)).toMatch(
      /not a real date/,
    );
    expect(validateWindows([w("2027-02-29", "18:00", "22:00")], timePoll)).toMatch(
      /not a real date/,
    );
  });

  it("accepts a real leap day", () => {
    expect(validateWindows([w("2028-02-29", "18:00", "22:00")], timePoll)).toBeNull();
  });
});

describe("validateWindows — the times on a date", () => {
  it("accepts several windows on one date", () => {
    expect(
      validateWindows(
        [w("2026-09-26", "09:00", "12:00"), w("2026-09-26", "20:00", "22:00")],
        timePoll,
      ),
    ).toBeNull();
  });

  it("accepts an overnight window, which is an end before its start", () => {
    expect(validateWindows([w("2026-09-22", "22:00", "02:00")], timePoll)).toBeNull();
    expect(validateWindows([w("2026-09-22", "22:00", "00:00")], timePoll)).toBeNull();
  });

  it("refuses a zero-length window, which would mean 24 hours", () => {
    expect(validateWindows([w("2026-09-22", "18:00", "18:00")], timePoll)).toMatch(
      /starts and ends at 18:00/,
    );
  });

  it("refuses a window missing a time", () => {
    expect(
      validateWindows([{ date: "2026-09-22", start: "18:00", end: null }], timePoll),
    ).toMatch(/no start or end time/);
  });

  it("refuses a time that is not a time", () => {
    expect(validateWindows([w("2026-09-22", "25:00", "26:00")], timePoll)).toMatch(
      /not a real time/,
    );
    expect(validateWindows([w("2026-09-22", "6pm", "10pm")], timePoll)).toMatch(
      /not a real time/,
    );
  });

  it("refuses more windows on one date than anyone meant", () => {
    const tooMany = Array.from({ length: MAX_WINDOWS_PER_DATE + 1 }, (_, i) =>
      w("2026-09-22", `0${i}:00`, `0${i}:30`),
    );
    expect(validateWindows(tooMany, timePoll)).toMatch(/Keep it to 6/);
  });

  it("names the date with the problem, since the form lists many", () => {
    expect(
      validateWindows(
        [w("2026-09-22", "18:00", "22:00"), w("2026-09-26", "18:00", "18:00")],
        timePoll,
      ),
    ).toMatch(/^2026-09-26/);
  });
});

describe("validateWindows — whole-date polls", () => {
  const dates = (...ds: string[]) => ds.map((date) => ({ date, start: null, end: null }));
  const trip = (fullDays: number) => ({ byDate: true, fullDays, now: NOW });

  it("accepts a trip that fits inside a run of picked dates", () => {
    expect(validateWindows(dates("2026-09-25", "2026-09-26", "2026-09-27"), trip(3))).toBeNull();
  });

  it("refuses a trip longer than the longest RUN, not the count", () => {
    // Four dates picked, but the longest stretch is two — so a 3-day trip can
    // never be found, and failing here beats an empty results page later.
    const problem = validateWindows(
      dates("2026-09-25", "2026-09-26", "2026-09-29", "2026-09-30"),
      trip(3),
    );
    expect(problem).toMatch(/longest run of dates you picked is 2/);
  });

  it("asks no questions about times, because it asks none for them", () => {
    expect(validateWindows(dates("2026-09-25"), trip(1))).toBeNull();
  });

  it("refuses a nonsensical trip length", () => {
    expect(validateWindows(dates("2026-09-25"), trip(0))).toMatch(/whole number/);
    expect(validateWindows(dates("2026-09-25"), trip(1.5))).toMatch(/whole number/);
  });
});
