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

export interface QuorumRules {
  /** Ideal headcount, e.g. 6 for badminton. */
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
      let people = new Set(bySlot.get(startKey));
      for (let k = 1; k < slotsNeeded && people.size >= minPlayers; k++) {
        const next = new Set(bySlot.get(slotKeys[i + k]));
        people = new Set([...people].filter((p) => next.has(p)));
      }
      if (people.size < minPlayers) continue;

      const candidate: Candidate = {
        start: new Date(startKey),
        end: new Date(startKey + duration * MINUTE_MS),
        durationMinutes: duration,
        tier,
        people: [...people].sort(),
        headcount: people.size,
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
  /** Best headcount available within the block. */
  headcount: number;
}

/**
 * Merge candidates that overlap or touch, keeping tier and duration distinct.
 *
 * Two candidates only merge when the same people carry the whole merged span,
 * so a block never claims a headcount nobody sustains. Ranking matches
 * computeCandidates: full before short, then headcount, then earliest.
 */
export function groupCandidates(candidates: Candidate[]): CandidateBlock[] {
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
      if (
        current &&
        c.start.getTime() <= current.end.getTime() &&
        sustained.length >= 1 &&
        sustained.length === Math.min(current.headcount, c.headcount)
      ) {
        current.end = new Date(Math.max(current.end.getTime(), c.end.getTime()));
        current.starts.push(c.start);
        current.people = sustained;
        current.headcount = sustained.length;
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
