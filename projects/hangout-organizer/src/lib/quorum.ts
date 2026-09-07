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
