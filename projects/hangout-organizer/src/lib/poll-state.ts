/**
 * Is a poll still taking answers?
 *
 * PURE. No Supabase, no Next, no React — same rule as `quorum.ts`, and for the
 * same reason: this decides whether a friend's submission is accepted, and it
 * is asked from three places that must never disagree. The public page renders
 * from it, the submit route enforces it, and the host page explains it.
 */

export type PollClosedReason = "host" | "cut-off";

export interface PollGate {
  status: string;
  /** ISO instant, or null for "open until the host says otherwise". */
  closes_at?: string | null;
}

/**
 * Why this poll is not accepting answers, or null if it still is.
 *
 * Two independent gates, and the order matters. A host who closed a poll early
 * did so deliberately, so that reason wins over a cut-off that has also since
 * passed — "I closed it" is the more useful thing to be told.
 *
 * The cut-off is evaluated here, on every request, rather than by a job that
 * flips `status`. That keeps the deadline free of any scheduler, and it keeps
 * the two facts separate: `status` records what the HOST decided, `closes_at`
 * records what they announced. Clearing a cut-off reopens the poll without
 * having to reconstruct why it shut.
 *
 * An unparseable `closes_at` is treated as no deadline. A poll that silently
 * refuses every answer because of a bad date string is the worse failure —
 * nobody would be able to tell from the outside why the link stopped working.
 */
export function pollClosedReason(poll: PollGate, now: Date = new Date()): PollClosedReason | null {
  if (poll.status !== "polling") return "host";
  const deadline = pollDeadline(poll);
  if (deadline && deadline.getTime() <= now.getTime()) return "cut-off";
  return null;
}

export function isPollOpen(poll: PollGate, now: Date = new Date()): boolean {
  return pollClosedReason(poll, now) === null;
}

/** The cut-off as a Date, or null when there is not a usable one. */
export function pollDeadline(poll: PollGate): Date | null {
  if (!poll.closes_at) return null;
  const at = new Date(poll.closes_at);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Roughly how long is left, for a "closes in about 3 hours" line.
 *
 * Deliberately coarse. A live countdown would be wrong the moment the page was
 * served, since every page here is server-rendered and then sat on; "about 3
 * hours" survives being read ten minutes late, and a precise "2:58:14" does
 * not. Returns null when there is no deadline or it has already passed — the
 * caller shows the closed state then, not a negative countdown.
 */
export function formatTimeLeft(poll: PollGate, now: Date = new Date()): string | null {
  const deadline = pollDeadline(poll);
  if (!deadline) return null;
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return null;

  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}
