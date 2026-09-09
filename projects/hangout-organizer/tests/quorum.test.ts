import { describe, expect, it } from "vitest";
import {
  computeCandidates,
  computeSlotCounts,
  groupCandidates,
  groupResponders,
  overlappingPeople,
  pendingResponders,
  type AvailabilityEntry,
  type QuorumRules,
} from "@/lib/quorum";
import { DAY_MINUTES, klToInstant } from "@/lib/slots";

// Badminton: 6 people -> 2 hours, 4 people -> 1 hour.
const BADMINTON: QuorumRules = {
  minPlayersFull: 6,
  fullDurationMinutes: 120,
  minPlayersShort: 4,
  shortDurationMinutes: 60,
};

const DAY = "2026-09-09";

/** `free("19:00", ["a","b"])` -> availability rows for that slot. */
function free(time: string, people: string[]): AvailabilityEntry[] {
  return people.map((personId) => ({
    personId,
    slotStart: klToInstant(DAY, time),
  }));
}

const SIX = ["ali", "ben", "cara", "dee", "eve", "finn"];
const FIVE = SIX.slice(0, 5);
const THREE = SIX.slice(0, 3);

describe("computeCandidates", () => {
  it("returns a full-tier 2-hour window when 6 people are free right across it", () => {
    const availability = [
      ...free("19:00", SIX),
      ...free("19:30", SIX),
      ...free("20:00", SIX),
      ...free("20:30", SIX),
    ];

    const result = computeCandidates(availability, BADMINTON, 30);

    expect(result[0].tier).toBe("full");
    expect(result[0].durationMinutes).toBe(120);
    expect(result[0].headcount).toBe(6);
    expect(result[0].start).toEqual(klToInstant(DAY, "19:00"));
    expect(result[0].end).toEqual(klToInstant(DAY, "21:00"));
  });

  it("treats the ideal headcount as inclusive, not 'more than'", () => {
    const availability = ["19:00", "19:30", "20:00", "20:30"].flatMap((t) => free(t, SIX));
    expect(computeCandidates(availability, BADMINTON, 30)[0].headcount).toBe(6);
  });

  it("falls back to a 1-hour window when only 5 people are free", () => {
    const availability = ["19:00", "19:30", "20:00", "20:30"].flatMap((t) => free(t, FIVE));

    const result = computeCandidates(availability, BADMINTON, 30);

    expect(result.every((c) => c.tier === "short")).toBe(true);
    expect(result[0].durationMinutes).toBe(60);
    expect(result[0].headcount).toBe(5);
  });

  it("returns nothing when even the fallback headcount is not met", () => {
    const availability = ["19:00", "19:30", "20:00", "20:30"].flatMap((t) => free(t, THREE));
    expect(computeCandidates(availability, BADMINTON, 30)).toEqual([]);
  });

  it("does NOT merge different people across slots into one window", () => {
    // Six free at 19:00-19:30 and a different six at 20:00-20:30. Per-slot counts
    // look great, but nobody spans the whole two hours and only 2 people overlap.
    const groupA = ["ali", "ben", "cara", "dee", "eve", "finn"];
    const groupB = ["ali", "ben", "gus", "hana", "ivy", "jo"];
    const availability = [
      ...free("19:00", groupA),
      ...free("19:30", groupA),
      ...free("20:00", groupB),
      ...free("20:30", groupB),
    ];

    const result = computeCandidates(availability, BADMINTON, 30);

    // No 2-hour window: the intersection across all four slots is just ali + ben.
    expect(result.some((c) => c.durationMinutes === 120)).toBe(false);
    // But each group's own hour is bookable at the short tier.
    const shortWindows = result.filter((c) => c.tier === "short");
    expect(shortWindows).toHaveLength(2);
    expect(shortWindows.every((c) => c.headcount === 6)).toBe(true);
  });

  it("never spans a gap in the polled slots", () => {
    // 20:00 is missing entirely, so no window can bridge 19:30 -> 20:30.
    const availability = [
      ...free("19:00", SIX),
      ...free("19:30", SIX),
      ...free("20:30", SIX),
      ...free("21:00", SIX),
    ];

    const result = computeCandidates(availability, BADMINTON, 30);

    expect(result.some((c) => c.durationMinutes === 120)).toBe(false);
    expect(result.filter((c) => c.tier === "short")).toHaveLength(2);
  });

  it("hides a short window that sits inside a qualifying full window", () => {
    const availability = ["19:00", "19:30", "20:00", "20:30"].flatMap((t) => free(t, SIX));

    const result = computeCandidates(availability, BADMINTON, 30);

    // Three 1-hour windows fit inside 19:00-21:00; none should be reported.
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe("full");
  });

  it("ranks full tier first, then headcount, then earliest start", () => {
    const seven = [...SIX, "gus"];
    const availability = [
      // 18:00-20:00 -> 6 people
      ...free("18:00", SIX),
      ...free("18:30", SIX),
      // 19:00-21:00 -> 7 people (overlaps the above)
      ...free("19:00", seven),
      ...free("19:30", seven),
      ...free("20:00", seven),
      ...free("20:30", seven),
    ];

    const result = computeCandidates(availability, BADMINTON, 30);

    expect(result[0].headcount).toBe(7);
    expect(result[0].start).toEqual(klToInstant(DAY, "19:00"));
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1];
      const cur = result[i];
      if (prev.tier === cur.tier) expect(prev.headcount).toBeGreaterThanOrEqual(cur.headcount);
    }
  });

  it("works with 60-minute slots", () => {
    const availability = [...free("19:00", SIX), ...free("20:00", SIX)];

    const result = computeCandidates(availability, BADMINTON, 60);

    expect(result).toHaveLength(1);
    expect(result[0].durationMinutes).toBe(120);
  });

  it("skips a tier whose duration is not a whole number of slots", () => {
    const availability = [...free("19:00", SIX), ...free("20:00", SIX)];
    const odd: QuorumRules = { ...BADMINTON, shortDurationMinutes: 90 };

    // 90 minutes cannot be built from 60-minute slots; the 2-hour tier still works.
    const result = computeCandidates(availability, odd, 60);

    expect(result.every((c) => c.durationMinutes === 120)).toBe(true);
  });

  it("returns nothing for an empty poll", () => {
    expect(computeCandidates([], BADMINTON, 30)).toEqual([]);
  });
});

describe("computeSlotCounts", () => {
  it("counts each slot independently and sorts people for stable output", () => {
    const counts = computeSlotCounts([...free("19:00", ["cara", "ali"]), ...free("19:30", ["ali"])]);

    expect(counts.get(klToInstant(DAY, "19:00").getTime())).toEqual(["ali", "cara"]);
    expect(counts.get(klToInstant(DAY, "19:30").getTime())).toEqual(["ali"]);
  });

  it("de-duplicates a person submitted twice for the same slot", () => {
    const counts = computeSlotCounts([...free("19:00", ["ali"]), ...free("19:00", ["ali"])]);
    expect(counts.get(klToInstant(DAY, "19:00").getTime())).toEqual(["ali"]);
  });
});

describe("pendingResponders", () => {
  it("lists roster members who have not answered", () => {
    const roster = [{ id: "ali" }, { id: "ben" }, { id: "cara" }];
    expect(pendingResponders(roster, ["ben"])).toEqual([{ id: "ali" }, { id: "cara" }]);
  });
});

describe("groupResponders", () => {
  const roster = [{ id: "ali" }, { id: "ben" }, { id: "cara" }, { id: "dan" }];

  it("splits the roster into voted, declined and waiting", () => {
    const groups = groupResponders(roster, [
      { person_id: "ali", declined: false },
      { person_id: "ben", declined: true },
      { person_id: "cara", declined: false },
    ]);
    expect(groups.voted).toEqual([{ id: "ali" }, { id: "cara" }]);
    expect(groups.declined).toEqual([{ id: "ben" }]);
    expect(groups.waiting).toEqual([{ id: "dan" }]);
  });

  it("counts a decline as an answer, never as someone still to chase", () => {
    // The whole point of the declined state. If this regresses, the host goes
    // back to chasing people who have already said no.
    const groups = groupResponders(roster, [{ person_id: "ben", declined: true }]);
    expect(groups.waiting.map((p) => p.id)).not.toContain("ben");
    expect(groups.voted.map((p) => p.id)).not.toContain("ben");
    expect(groups.declined).toEqual([{ id: "ben" }]);
  });

  it("treats a response with no `declined` field as a normal answer", () => {
    // Rows written before migration 008 have no such column.
    const groups = groupResponders(roster, [{ person_id: "ali" }]);
    expect(groups.voted).toEqual([{ id: "ali" }]);
    expect(groups.declined).toEqual([]);
  });

  it("puts every roster member in exactly one group", () => {
    const groups = groupResponders(roster, [
      { person_id: "ali", declined: false },
      { person_id: "ben", declined: true },
    ]);
    const all = [...groups.voted, ...groups.declined, ...groups.waiting].map((p) => p.id);
    expect(all.sort()).toEqual(["ali", "ben", "cara", "dan"]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("ignores responses from people who are not on the roster", () => {
    // A poll's invitee list is frozen at creation, so someone removed from the
    // roster afterwards can still have a row. They must not appear anywhere.
    const groups = groupResponders(roster, [{ person_id: "ghost", declined: true }]);
    expect(groups.declined).toEqual([]);
    expect(groups.waiting).toEqual(roster);
  });
});

describe("groupCandidates", () => {
  const people = ["a", "b", "c", "d", "e", "f"];

  function freeAcross(times: string[]): AvailabilityEntry[] {
    return times.flatMap((t) =>
      people.map((personId) => ({ personId, slotStart: klToInstant("2026-09-14", t) })),
    );
  }

  it("collapses one long free stretch into a single block", () => {
    // 19:00-22:00 free: five 2-hour candidates at 19:00, 19:30, 20:00, ...
    const availability = freeAcross([
      "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
    ]);
    const candidates = computeCandidates(availability, BADMINTON, 30);
    expect(candidates.filter((c) => c.tier === "full").length).toBeGreaterThan(1);

    const blocks = groupCandidates(candidates).filter((b) => b.tier === "full");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].start).toEqual(klToInstant("2026-09-14", "19:00"));
    expect(blocks[0].end).toEqual(klToInstant("2026-09-14", "22:00"));
    expect(blocks[0].headcount).toBe(6);
    // Every legitimate start is still offered, so the host keeps the choice.
    expect(blocks[0].starts).toHaveLength(
      candidates.filter((c) => c.tier === "full").length,
    );
  });

  it("keeps genuinely separate stretches apart", () => {
    const availability = [
      ...freeAcross(["19:00", "19:30", "20:00", "20:30"]),
      // gap at 21:00
      ...freeAcross(["21:30", "22:00", "22:30", "23:00"]),
    ];
    const blocks = groupCandidates(computeCandidates(availability, BADMINTON, 30)).filter(
      (b) => b.tier === "full",
    );
    expect(blocks).toHaveLength(2);
  });

  it("never claims a headcount that nobody sustains across the block", () => {
    // Six free 19:00-21:00; only four of them stay to 21:30.
    const availability = [
      ...freeAcross(["19:00", "19:30", "20:00", "20:30"]),
      ...["21:00", "21:30"].flatMap((t) =>
        people.slice(0, 4).map((personId) => ({
          personId,
          slotStart: klToInstant("2026-09-14", t),
        })),
      ),
    ];
    for (const block of groupCandidates(computeCandidates(availability, BADMINTON, 30))) {
      expect(block.people).toHaveLength(block.headcount);
      // Anyone credited to the block must be free at every start it offers.
      for (const start of block.starts) {
        const slotsInWindow = block.durationMinutes / 30;
        for (let k = 0; k < slotsInWindow; k++) {
          const at = new Date(start.getTime() + k * 30 * 60_000).getTime();
          for (const personId of block.people) {
            expect(
              availability.some(
                (e) => e.personId === personId && e.slotStart.getTime() === at,
              ),
            ).toBe(true);
          }
        }
      }
    }
  });
});

describe("overlappingPeople", () => {
  const at = (t: string) => klToInstant("2026-09-14", t);

  it("finds the people double-booked across two confirmed sessions", () => {
    expect(
      overlappingPeople(
        { start: at("19:00"), durationMinutes: 120, people: ["a", "b", "c"] },
        { start: at("20:00"), durationMinutes: 60, people: ["c", "a", "z"] },
      ),
    ).toEqual(["a", "c"]);
  });

  it("is quiet when the times do not overlap", () => {
    expect(
      overlappingPeople(
        { start: at("19:00"), durationMinutes: 60, people: ["a", "b"] },
        { start: at("20:00"), durationMinutes: 60, people: ["a", "b"] },
      ),
    ).toEqual([]);
  });

  it("is quiet when the times overlap but nobody is in both", () => {
    expect(
      overlappingPeople(
        { start: at("19:00"), durationMinutes: 120, people: ["a", "b"] },
        { start: at("19:30"), durationMinutes: 60, people: ["y", "z"] },
      ),
    ).toEqual([]);
  });
});

describe("date polls reuse the engine unchanged", () => {
  // "Which 3 consecutive days suit 4 of us for the trip?" is the same question
  // as "which 2 consecutive hours suit 6 of us", with a day-sized slot.
  const TRIP = {
    minPlayersFull: 4,
    fullDurationMinutes: 3 * DAY_MINUTES,
    minPlayersShort: 3,
    shortDurationMinutes: 2 * DAY_MINUTES,
  };

  const day = (d: string) => klToInstant(d, "00:00");

  function free(dates: string[], people: string[]): AvailabilityEntry[] {
    return dates.flatMap((d) => people.map((personId) => ({ personId, slotStart: day(d) })));
  }

  it("finds a run of consecutive days the same people are all free", () => {
    const availability = [
      ...free(["2026-09-11", "2026-09-12", "2026-09-13"], ["a", "b", "c", "d"]),
      ...free(["2026-09-14"], ["a", "b"]),
    ];
    const candidates = computeCandidates(availability, TRIP, DAY_MINUTES);
    const full = candidates.filter((c) => c.tier === "full");
    expect(full).toHaveLength(1);
    expect(full[0].start).toEqual(day("2026-09-11"));
    expect(full[0].headcount).toBe(4);
    expect(full[0].durationMinutes).toBe(3 * DAY_MINUTES);
  });

  it("will not stitch a trip across a gap in the dates", () => {
    // Free Fri and Sat, then Mon and Tue — that is not a 3-day trip.
    const availability = [
      ...free(["2026-09-11", "2026-09-12"], ["a", "b", "c", "d"]),
      ...free(["2026-09-14", "2026-09-15"], ["a", "b", "c", "d"]),
    ];
    expect(computeCandidates(availability, TRIP, DAY_MINUTES).filter((c) => c.tier === "full"))
      .toHaveLength(0);
  });

  it("applies the same-people rule across days", () => {
    // Four free Fri+Sat, a DIFFERENT four free Sun. No 3-day trip.
    const availability = [
      ...free(["2026-09-11", "2026-09-12"], ["a", "b", "c", "d"]),
      ...free(["2026-09-13"], ["w", "x", "y", "z"]),
    ];
    expect(computeCandidates(availability, TRIP, DAY_MINUTES).filter((c) => c.tier === "full"))
      .toHaveLength(0);
  });

  it("falls back to the shorter trip when the full one does not fit", () => {
    const availability = free(["2026-09-11", "2026-09-12"], ["a", "b", "c"]);
    const candidates = computeCandidates(availability, TRIP, DAY_MINUTES);
    expect(candidates.filter((c) => c.tier === "full")).toHaveLength(0);
    const short = candidates.filter((c) => c.tier === "short");
    expect(short).toHaveLength(1);
    expect(short[0].headcount).toBe(3);
  });
});
