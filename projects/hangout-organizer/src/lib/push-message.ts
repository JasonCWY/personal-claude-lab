/**
 * PURE. What a notification says. No imports, same rule as `quorum.ts`.
 *
 * Split out from `push.ts` so it can be tested: `push.ts` reaches the database
 * and is therefore `server-only`, and that package throws the moment anything
 * outside a server bundle imports it — including vitest.
 */

export type Answer = "first" | "changed" | "declined";

export interface ResponseNotice {
  personName: string;
  pollTitle: string;
  pollId: string;
  /** "None of these work for me" — a real answer, not the absence of one. */
  declined: boolean;
  /** False when a `poll_responses` row already existed for this person. */
  isFirstAnswer: boolean;
  /** Rows in `poll_responses` for this poll, after this submission. */
  answered: number;
  /** Rows in `poll_invitees` for this poll. */
  invited: number;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Collapse key — see below. */
  tag: string;
  /** Where a tap lands. Relative, resolved against the service worker scope. */
  url: string;
}

/** Keeps a long display name from eating the whole lock-screen line. */
function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function describeResponse(notice: ResponseNotice): PushPayload {
  const who = clip(notice.personName, 24) || "Someone";

  // The three answers this app refuses to collapse (see CLAUDE.md) stay
  // distinct here too. "Changed their answer" matters most: without it, someone
  // fixing a typo reads identically to a new person answering, and the host
  // goes to look at a poll that has not actually moved.
  const answer: Answer = notice.declined
    ? "declined"
    : notice.isFirstAnswer
      ? "first"
      : "changed";

  const title = {
    first: `${who} answered`,
    changed: `${who} changed their answer`,
    declined: `${who} can't make it`,
  }[answer];

  const parts = [clip(notice.pollTitle, 40)];
  // Guard the denominator rather than trusting the caller: an invitee list that
  // came back empty would otherwise render "3 of 0 answered", which reads like
  // a bug in the quorum engine rather than a failed count query.
  if (notice.invited > 0) {
    parts.push(`${notice.answered} of ${notice.invited} answered`);
  }

  return {
    title,
    body: parts.join(" · "),
    /*
     * One notification per poll, replaced rather than stacked.
     *
     * The submit endpoint is open to anyone holding the share link, so the
     * number of pushes this can produce is bounded only by how many times
     * someone taps Save. A per-poll tag turns "six people answered while you
     * were driving" — and equally "one person tapped Save six times" — into a
     * single current notification whose body already carries the running count,
     * so nothing is lost by replacing the earlier ones.
     */
    tag: `poll:${notice.pollId}`,
    url: `/polls/${notice.pollId}`,
  };
}
