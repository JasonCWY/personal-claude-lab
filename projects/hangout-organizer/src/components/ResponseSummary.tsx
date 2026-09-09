import { groupResponders } from "@/lib/quorum";
import type { Person, PollResponse } from "@/lib/types";

/**
 * Who answered, who said no, and who has not replied — the three states of a
 * poll, side by side.
 *
 * These facts were previously spread across a header count, a "waiting on"
 * line, a declined line and a separate comment list, and between them they
 * never actually named the people who *did* answer. The host's real question
 * when they open this page is "can I book yet, and if not who am I waiting
 * for", which is a question about all three groups at once.
 *
 * Voted rows carry a slot count because "answered" is not one thing: someone
 * who marked two slots and someone who marked twenty are both "answered", and
 * the difference is most of why a window fails to reach quorum. Comments sit
 * against their author for the same reason — a note explaining a thin answer
 * is worthless three sections away from it.
 */
export function ResponseSummary({
  roster,
  responses,
  slotsByPerson,
  byDate,
}: {
  roster: Person[];
  responses: PollResponse[];
  /** person_id -> how many slots they marked free. */
  slotsByPerson: Map<string, number>;
  /** A date poll counts whole days, so the unit word changes. */
  byDate: boolean;
}) {
  const byPerson = new Map(responses.map((r) => [r.person_id, r]));

  // The split lives in quorum.ts, not here. A decline counting as silence in
  // this component while counting as an answer in the engine is exactly the
  // drift the "pure and tested first" rule exists to stop, and it has tests.
  // Roster order is display_name, so every column reads alphabetically.
  const { voted, declined, waiting } = groupResponders(roster, responses);

  const unit = byDate ? "date" : "slot";

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <Column
        title="Voted"
        count={voted.length}
        tone="ok"
        empty="Nobody yet."
        people={voted.map((p) => {
          const n = slotsByPerson.get(p.id) ?? 0;
          return {
            id: p.id,
            name: p.display_name,
            // A response with no slots is not a decline — they submitted an
            // empty grid — and it is worth flagging rather than showing "0".
            note: n === 0 ? "no times marked" : `${n} ${unit}${n === 1 ? "" : "s"}`,
            comment: byPerson.get(p.id)?.comment ?? null,
            muted: n === 0,
          };
        })}
      />
      <Column
        title="Can't make it"
        count={declined.length}
        tone="neutral"
        empty="Nobody has ruled themselves out."
        people={declined.map((p) => ({
          id: p.id,
          name: p.display_name,
          note: null,
          comment: byPerson.get(p.id)?.comment ?? null,
          muted: false,
        }))}
      />
      <Column
        title="Not answered"
        count={waiting.length}
        tone="warn"
        empty="Everyone has replied."
        people={waiting.map((p) => ({
          id: p.id,
          name: p.display_name,
          note: null,
          comment: null,
          muted: false,
        }))}
      />
    </div>
  );
}

function Column({
  title,
  count,
  tone,
  empty,
  people,
}: {
  title: string;
  count: number;
  tone: "ok" | "neutral" | "warn";
  empty: string;
  people: {
    id: string;
    name: string;
    note: string | null;
    comment: string | null;
    muted: boolean;
  }[];
}) {
  const heading = {
    ok: "text-ok-fg",
    neutral: "text-ink-muted",
    warn: "text-warn-fg",
  }[tone];
  const rule = {
    ok: "border-ok-border bg-ok-bg",
    neutral: "border-line bg-surface-2",
    warn: "border-warn-border bg-warn-bg",
  }[tone];

  return (
    <div className={`rounded-lg border p-3 ${rule}`}>
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>
        {title} · {count}
      </h3>
      {people.length === 0 ? (
        <p className="mt-2 text-xs text-ink-faint">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {people.map((p) => (
            <li key={p.id} className="text-sm leading-tight">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className={p.muted ? "text-ink-soft" : "text-ink"}>{p.name}</span>
                {p.note && (
                  <span
                    className={`text-xs tabular-nums ${
                      p.muted ? "text-warn-fg" : "text-ink-soft"
                    }`}
                  >
                    {p.note}
                  </span>
                )}
              </span>
              {p.comment && (
                <span className="mt-0.5 block text-xs italic text-ink-soft">
                  &ldquo;{p.comment}&rdquo;
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
