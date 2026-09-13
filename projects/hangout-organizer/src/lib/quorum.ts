/**
 * Quorum engine — the core scheduling logic.
 *
 * PURE MODULE. No Supabase, no Next, no React, no I/O. Same rule as
 * debt-tracker's services/calculator.py: test changes here first.
 *
 * The subtlety this exists for: six people free at 19:00 and a *different* six
 * free at 19:30 does NOT make a bookable two-hour block. A window only counts
 * if the same people are free for its whole duration, so every window is scored
 * on the INTERSECTION of its slots, never the per-slot maximum.
 */

export interface AvailabilityEntry {
  personId: string;
  /** Start of a slot the person is free for, as an absolute instant. */
  slotStart: Date;
}

/**
 * How many people each responder is bringing, including themselves.
 *
 * Absent, or absent for a given person, means one. That default is what keeps
 * every caller that does not care about guests — and every poll answered before
 * migration 010 — scoring exactly as it did before.
 */
export type PartySizes = Readonly<Record<string, number>>;

/**
 * Bodies, not rows.
 *
 * The distinction this whole module now turns on: six responders where two are
 * bringing a friend is eight players, and booking a court for six was simply
 * the wrong answer. A thresholds like `minPlayersFull` was always talking about
 * people on a court; until party sizes existed, rows happened to be the same
 * number.
 *
 * Guards against a nonsensical stored value rather than trusting the column —
 * this arrives from a public endpoint, and a zero or a negative here would
 * quietly make someone count for nothing or subtract from the group.
 */
export function headcountOf(people: Iterable<string>, partySizes?: PartySizes): number {
  let total = 0;
  for (const person of people) {
    const size = partySizes?.[person];
    total += typeof size === "number" && Number.isFinite(size) && size >= 1 ? Math.floor(size) : 1;
  }
  return total;
}

export interface QuorumRules {
  /** Ideal headcount, e.g. 6 for badminton. Bodies, not responders. */
  minPlayersFull: number;
  /** Duration to book when the ideal headcount turns up, e.g. 120. */
  fullDurationMinutes: number;
  /** Fallback headcount, e.g. 4. */
  minPlayersShort: number;
  /** Duration to book at the fallback headcount, e.g. 60. */
  shortDurationMinutes: number;
}

export type QuorumTier = "full" | "short";

export interface Candidate {
  start: Date;
  end: Date;
  durationMinutes: number;
  tier: QuorumTier;
  /** Everyone free for the ENTIRE window, sorted for stable output. */
  people: string[];
  /**
   * Bodies across that window: the sum of those people's party sizes, which is
   * `people.length` only when nobody is bringing anyone. This is the number
   * compared against the quorum thresholds, and the number to show a host.
   */
  headcount: number;
}

const MINUTE_MS = 60_000;

/**
 * Count how many people are free in each individual slot.
 * Feeds the heatmap; deliberately separate from window logic.
 */
export function computeSlotCounts(
  availability: AvailabilityEntry[],
): Map<number, string[]> {
  const bySlot = new Map<number, Set<string>>();
  for (const entry of availability) {
    const key = entry.slotStart.getTime();
    let people = bySlot.get(key);
    if (!people) {
      people = new Set();
      bySlot.set(key, people);
    }
    people.add(entry.personId);
  }
  const out = new Map<number, string[]>();
  for (const [key, people] of bySlot) {
    out.set(key, [...people].sort());
  }
  return out;
}

/**
 * Every window that meets a quorum, best first.
 *
 * Ranking: full tier before short, then headcount descending, then earliest.
 * A short-tier window fully contained inside a qualifying full-tier window is
 * dropped — it is strictly worse information for the host.
 */
export function computeCandidates(
  availability: AvailabilityEntry[],
  rules: QuorumRules,
  slotMinutes: number,
  partySizes?: PartySizes,
): Candidate[] {
  if (slotMinutes <= 0) return [];

  const bySlot = computeSlotCounts(availability);
  const slotKeys = [...bySlot.keys()].sort((a, b) => a - b);
  if (slotKeys.length === 0) return [];

  const step = slotMinutes * MINUTE_MS;

  const tiers: { tier: QuorumTier; minPlayers: number; duration: number }[] = [
    {
      tier: "full",
      minPlayers: rules.minPlayersFull,
      duration: rules.fullDurationMinutes,
    },
    {
      tier: "short",
      minPlayers: rules.minPlayersShort,
      duration: rules.shortDurationMinutes,
    },
  ];

  const full: Candidate[] = [];
  const short: Candidate[] = [];

  for (const { tier, minPlayers, duration } of tiers) {
    if (minPlayers <= 0 || duration <= 0) continue;
    // A window must be a whole number of slots.
    if (duration % slotMinutes !== 0) continue;
    const slotsNeeded = duration / slotMinutes;

    for (let i = 0; i + slotsNeeded <= slotKeys.length; i++) {
      const startKey = slotKeys[i];

      // The window must be contiguous: no gaps, no jump across a day boundary.
      let contiguous = true;
      for (let k = 1; k < slotsNeeded; k++) {
        if (slotKeys[i + k] !== startKey + k * step) {
          contiguous = false;
          break;
        }
      }
      if (!contiguous) continue;

      // Intersect the people free across every slot in the window.
      //
      // The loop gives up early once the quorum can no longer be met, which is
      // sound because an intersection only ever shrinks and so its headcount
      // only ever falls. That test has to weigh the set rather than count it:
      // with party sizes, `people.size` understates the headcount, and
      // stopping on the count would discard windows that four responders
      // bringing friends genuinely do fill.
      let people = new Set(bySlot.get(startKey));
      for (let k = 1; k < slotsNeeded && headcountOf(people, partySizes) >= minPlayers; k++) {
        const next = new Set(bySlot.get(slotKeys[i + k]));
        people = new Set([...people].filter((p) => next.has(p)));
      }
      const headcount = headcountOf(people, partySizes);
      if (headcount < minPlayers) continue;

      const candidate: Candidate = {
        start: new Date(startKey),
        end: new Date(startKey + duration * MINUTE_MS),
        durationMinutes: duration,
        tier,
        people: [...people].sort(),
        headcount,
      };
      (tier === "full" ? full : short).push(candidate);
    }
  }

  const usefulShort = short.filter(
    (s) =>
      !full.some(
        (f) => f.start.getTime() <= s.start.getTime() && f.end.getTime() >= s.end.getTime(),
      ),
  );

  return [...full, ...usefulShort].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "full" ? -1 : 1;
    if (a.headcount !== b.headcount) return b.headcount - a.headcount;
    return a.start.getTime() - b.start.getTime();
  });
}

/** Who has not answered yet, so the host knows who to chase. */
export function pendingResponders<T extends { id: string }>(
  roster: T[],
  respondedPersonIds: string[],
): T[] {
  const responded = new Set(respondedPersonIds);
  return roster.filter((p) => !responded.has(p.id));
}

export interface ResponderGroups<T> {
  /** Answered with times. */
  voted: T[];
  /** Answered "none of these work". */
  declined: T[];
  /** Has not answered at all. */
  waiting: T[];
}

/**
 * Split the invitee list into the three states a poll can leave someone in.
 *
 * The distinction that matters and is easy to lose: a decline is an ANSWER.
 * Someone who said "none of these work" belongs with the people who replied,
 * never with the people still being waited on — chasing them is the exact
 * mistake this state was added to prevent. And they are not "voted" either,
 * because they contribute no availability, so counting them there would
 * overstate how much of the group has actually offered times.
 *
 * `declined` is read as optional so this behaves sanely against rows written
 * before migration 008, where the column does not exist: absent means not
 * declined, which is what every pre-existing response was.
 *
 * Roster order is preserved, so callers get whatever ordering they queried.
 */
export function groupResponders<T extends { id: string }>(
  roster: T[],
  responses: { person_id: string; declined?: boolean }[],
): ResponderGroups<T> {
  const byPerson = new Map(responses.map((r) => [r.person_id, r]));
  return {
    voted: roster.filter((p) => {
      const r = byPerson.get(p.id);
      return Boolean(r) && !r!.declined;
    }),
    declined: roster.filter((p) => Boolean(byPerson.get(p.id)?.declined)),
    waiting: pendingResponders(roster, [...byPerson.keys()]),
  };
}

/**
 * A run of overlapping candidates of the same tier, collapsed into one block.
 *
 * Why this exists: with 30-minute slots and a 2-hour rule, a single 3-hour free
 * block yields FIVE candidates, one per half-hour start. Listing them all reads
 * as five options when it is really one stretch of time with some latitude
 * about when to begin. The host wants to see "Tue 19:00-22:00, six of you,
 * start anywhere up to 20:00" — one decision, not five near-identical rows.
 */
export interface CandidateBlock {
  /** Earliest start among the merged candidates. */
  start: Date;
  /** Latest end among them — so end - start is the whole free stretch. */
  end: Date;
  /** Every start time the host could pick, earliest first. */
  starts: Date[];
  /** Duration of one booking, not of the block. */
  durationMinutes: number;
  tier: QuorumTier;
  /** People free across the ENTIRE block. */
  people: string[];
  /** Bodies sustained across the block — party sizes included. */
  headcount: number;
}

/**
 * Merge candidates that overlap or touch, keeping tier and duration distinct.
 *
 * Two candidates only merge when the same people carry the whole merged span,
 * so a block never claims a headcount nobody sustains. Ranking matches
 * computeCandidates: full before short, then headcount, then earliest.
 */
export function groupCandidates(
  candidates: Candidate[],
  partySizes?: PartySizes,
): CandidateBlock[] {
  const blocks: CandidateBlock[] = [];

  for (const key of [...new Set(candidates.map((c) => `${c.tier}|${c.durationMinutes}`))]) {
    const [tier, duration] = key.split("|");
    const run = candidates
      .filter((c) => c.tier === tier && String(c.durationMinutes) === duration)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    let current: CandidateBlock | null = null;
    for (const c of run) {
      const sustained = current
        ? current.people.filter((p) => c.people.includes(p))
        : c.people;

      // Merge only while contiguous AND the same people hold the whole span —
      // otherwise the block would advertise a headcount that never existed.
      //
      // The test is deliberately on people COUNTS, not headcounts: what it is
      // asking is whether one group is simply a subset of the other, and that
      // is a question about the sets themselves. Comparing party-weighted
      // headcounts here would let two different groups that happen to sum to
      // the same number merge into a block neither of them sustains.
      if (
        current &&
        c.start.getTime() <= current.end.getTime() &&
        sustained.length >= 1 &&
        sustained.length === Math.min(current.people.length, c.people.length)
      ) {
        current.end = new Date(Math.max(current.end.getTime(), c.end.getTime()));
        current.starts.push(c.start);
        current.people = sustained;
        current.headcount = headcountOf(sustained, partySizes);
        continue;
      }

      current = {
        start: c.start,
        end: c.end,
        starts: [c.start],
        durationMinutes: c.durationMinutes,
        tier: c.tier,
        people: [...c.people],
        headcount: c.headcount,
      };
      blocks.push(current);
    }
  }

  return blocks.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "full" ? -1 : 1;
    if (a.headcount !== b.headcount) return b.headcount - a.headcount;
    return a.start.getTime() - b.start.getTime();
  });
}

/**
 * Do two confirmed bookings overlap in time AND share people?
 *
 * The reason polls own availability: badminton and pickleball planned over the
 * same week can be confirmed into the same hour with the same players, and
 * before this restructure nothing was in a position to notice.
 */
export function overlappingPeople(
  a: { start: Date; durationMinutes: number; people: string[] },
  b: { start: Date; durationMinutes: number; people: string[] },
): string[] {
  const aEnd = a.start.getTime() + a.durationMinutes * MINUTE_MS;
  const bEnd = b.start.getTime() + b.durationMinutes * MINUTE_MS;
  const timeOverlap = a.start.getTime() < bEnd && b.start.getTime() < aEnd;
  if (!timeOverlap) return [];
  const bs = new Set(b.people);
  return a.people.filter((p) => bs.has(p)).sort();
}
