"use client";

import { useEffect, useState } from "react";
import { AvailabilityGrid } from "@/components/AvailabilityGrid";
import { DateGrid } from "@/components/DateGrid";
import type { GameSession, Person } from "@/lib/types";

/** Which person this device answered as last time, across every poll. */
const PERSON_KEY = "hangout-organizer:person-id";

interface Props {
  token: string;
  spec: {
    pollStartDate: string;
    pollEndDate: string;
    granularity?: "time" | "date";
    dayStartTime: string;
    dayEndTime: string;
    slotMinutes: number;
  };
  roster: Person[];
  /** person_id -> slot timestamps they already submitted, so answers are editable. */
  existing: Record<string, number[]>;
  respondedIds: string[];
  /** Who has already answered "none of these work". A subset of respondedIds. */
  declinedIds: string[];
  /** The activities this poll is trying to arrange. */
  sessions: GameSession[];
  /** person_id -> session_ids they previously said they were not up for. */
  existingOptOuts: Record<string, string[]>;
}

export function PollForm({
  token,
  spec,
  roster,
  existing,
  respondedIds,
  declinedIds,
  sessions,
  existingOptOuts,
}: Props) {
  const [personId, setPersonId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [comment, setComment] = useState("");
  // Opt-outs, so an activity added later counts everyone until they say no.
  const [optOut, setOptOut] = useState<Set<string>>(new Set());
  // "None of these work for me" — an answer in its own right, not an empty one.
  const [declined, setDeclined] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const responded = new Set(respondedIds);
  const declinedSetForInit = new Set(declinedIds);

  /*
   * Remember who this device is. The link arrives every week and the first
   * thing it asked for was finding your own name in a grid of thirteen — a
   * step that is the same answer every time. Read after mount, never during
   * render: the server has no localStorage, and reading it inline would render
   * one identity on the server and a different one in the browser.
   *
   * The person id is stored, not the name, and it is only honoured when that
   * id is actually invited to THIS poll — a stale id from a poll someone is no
   * longer part of should select nobody rather than the wrong person. "Not
   * you?" clears it, which is the escape hatch for a shared phone.
   */
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(PERSON_KEY);
    } catch {
      // Private mode, or storage blocked. Falling back to the picker is fine.
    }
    if (!stored) return;
    const person = roster.find((p) => p.id === stored);
    if (person) {
      setPersonId(person.id);
      setSelected(new Set(existing[person.id] ?? []));
      setOptOut(new Set(existingOptOuts[person.id] ?? []));
      setDeclined(declinedSetForInit.has(person.id));
    }
    // Runs once on mount: this is about restoring a choice, not tracking props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const declinedSet = new Set(declinedIds);

  function pick(person: Person) {
    try {
      localStorage.setItem(PERSON_KEY, person.id);
    } catch {
      // Not being remembered is a smaller problem than not being able to answer.
    }
    setPersonId(person.id);
    setSelected(new Set(existing[person.id] ?? []));
    setOptOut(new Set(existingOptOuts[person.id] ?? []));
    setDeclined(declinedSet.has(person.id));
    setStatus("idle");
  }

  async function submit(asDecline: boolean) {
    if (!personId) return;
    setStatus("saving");
    try {
      const res = await fetch(`/api/public/s/${token}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          slots: asDecline ? [] : [...selected].map((ms) => new Date(ms).toISOString()),
          comment: comment.trim() || null,
          optOutSessionIds: [...optOut],
          declined: asDecline,
        }),
      });
      if (res.ok) {
        setDeclined(asDecline);
        if (asDecline) setSelected(new Set());
      }
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (!personId) {
    return (
      <div>
        <h2 className="font-medium">Who are you?</h2>
        <p className="mb-3 text-sm text-ink-soft">Tap your name to answer.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {roster.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => pick(person)}
              className="flex min-h-tap flex-col justify-center rounded-xl border border-line-strong bg-surface px-3 py-3 text-sm font-medium transition active:scale-[0.98] hover:border-accent"
            >
              {person.display_name}
              {responded.has(person.id) && (
                <span
                  className={`mt-0.5 block text-xs font-normal ${
                    declinedSet.has(person.id) ? "text-ink-soft" : "text-ok-fg"
                  }`}
                >
                  {declinedSet.has(person.id) ? "can't make it" : "answered"}
                </span>
              )}
            </button>
          ))}
        </div>
        {roster.length === 0 && (
          <p className="text-sm text-ink-soft">
            The roster is empty — ask the host to add you before answering.
          </p>
        )}
      </div>
    );
  }

  const me = roster.find((p) => p.id === personId);
  const byDate = spec.granularity === "date";
  const nothingPicked = !declined && selected.size === 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          {me?.display_name},{" "}
          {declined
            ? "you said none of these work"
            : byDate
              ? "tap the dates that work for you"
              : "drag the times you can make"}
        </h2>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.removeItem(PERSON_KEY);
            } catch {
              // Nothing to undo if it was never stored.
            }
            setPersonId(null);
          }}
          className="-mr-2 rounded-lg px-2 py-1.5 text-sm text-ink-soft underline transition-colors hover:text-ink"
        >
          Not you?
        </button>
      </div>

      {declined ? (
        /*
         * The grid is replaced rather than disabled. A greyed-out grid still
         * invites tapping and leaves the person unsure whether their answer
         * registered; this states the answer plainly and offers exactly one way
         * back, which is what someone who tapped it by accident needs.
         */
        <div className="rounded-xl border border-line-strong bg-surface-2 p-4">
          <p className="text-sm text-ink-muted">
            You are down as not free for any of{" "}
            {byDate ? "these dates" : "the times being polled"}. The host can see that, so nobody
            will chase you about it.
          </p>
          <button
            type="button"
            onClick={() => {
              setDeclined(false);
              setStatus("idle");
            }}
            className="mt-3 text-sm font-medium text-ink underline"
          >
            Actually, let me pick {byDate ? "dates" : "times"}
          </button>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-muted">
            {byDate
              ? "Tap every date you could do. Tap again to clear one."
              : "Tap or drag to mark yourself free. Drag over green slots again to clear them."}
          </p>

          {byDate ? (
            <DateGrid spec={spec} selected={selected} onChange={setSelected} />
          ) : (
            <AvailabilityGrid spec={spec} selected={selected} onChange={setSelected} />
          )}
        </>
      )}

      {!declined && sessions.length > 1 && (
        <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
          <h3 className="text-sm font-medium">Which of these are you up for?</h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            Your times above count for everything you leave ticked.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {sessions.map((session) => {
              const on = !optOut.has(session.id);
              return (
                <label
                  key={session.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    on ? "border-accent bg-surface" : "border-line bg-surface-2 text-ink-faint"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-ok-solid"
                    checked={on}
                    onChange={() =>
                      setOptOut((prev) => {
                        const next = new Set(prev);
                        if (next.has(session.id)) next.delete(session.id);
                        else next.add(session.id);
                        return next;
                      })
                    }
                  />
                  {session.title}
                </label>
              );
            })}
          </div>
          {optOut.size === sessions.length && (
            <p className="mt-2 text-xs text-warn-fg">
              You have unticked everything, so your times will not count toward anything.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional note for the host"
          className="min-h-tap w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
        />

        {!declined && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg py-1 text-sm text-ink-soft underline transition-colors hover:text-ink"
            >
              Clear all
            </button>
          </div>
        )}

        {!declined && (
          /*
           * Separated from Submit, and worded as the sentence someone would
           * actually say. Submitting an empty grid would record the same thing,
           * but nobody guesses that — without this they either leave the link
           * unanswered or invent a slot they cannot really make, and both are
           * worse for the host than a plain no.
           */
          <div className="border-t border-line pt-3">
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={status === "saving"}
              className="rounded-lg py-1 text-sm font-medium text-ink-muted underline transition-colors hover:text-ink disabled:opacity-50"
            >
              I can&apos;t make any of {byDate ? "these dates" : "these times"}
            </button>
          </div>
        )}
      </div>

      {/*
        Pinned to the bottom of the phone screen. The -mx-8/px-8 pair cancels
        both gutters it sits inside — the card's p-4 and the page's px-4 — so
        the bar reaches the screen edges instead of ending on the card border
        with the grid visible scrolling past either side of it. Below `sm` the
        page is always full width, which is what makes that arithmetic exact. A month-long poll is several
        screens of grid, so Submit used to be somewhere below the fold the whole
        time someone was choosing — you had to finish, scroll back down, and
        find it. Keeping the running count next to it also means the answer to
        "have I actually marked anything?" is visible while you mark things.
        From `sm` up there is no fold to fall below, so it returns to the flow.
      */}
      <div className="sticky bottom-0 z-20 -mx-8 mt-4 border-t border-line bg-surface/95 px-8 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-sm sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:backdrop-blur-none">
        {status === "saved" && (
          <p className="mb-3 rounded-lg border border-ok-border bg-ok-bg p-3 text-sm text-ok-fg">
            {declined
              ? "Saved — you are down as not free for this one. You can change it any time before the host books."
              : "Saved. You can come back and change this any time before the host books."}
          </p>
        )}
        {status === "error" && (
          <p className="mb-3 rounded-lg border border-bad-border bg-bad-bg p-3 text-sm text-bad-fg">
            Could not save — check your connection and try again.
          </p>
        )}

        {/*
          Submitting an empty grid records exactly what the decline button
          records, and nobody guesses that — so the ambiguous path is closed
          and the explicit one named. Two answers that mean different things to
          the host must not share a button.
        */}
        {nothingPicked && (
          <p className="mb-2 text-xs text-ink-soft">
            Pick at least one {byDate ? "date" : "time"}, or say you can&apos;t make any.
          </p>
        )}

        <div className="flex items-center gap-3">
          {!declined && (
            <span className="text-sm tabular-nums text-ink-soft">
              {selected.size} {byDate ? (selected.size === 1 ? "date" : "dates") : selected.size === 1 ? "slot" : "slots"}
            </span>
          )}
          <button
            type="button"
            onClick={() => submit(declined)}
            disabled={status === "saving" || nothingPicked}
            className="ml-auto min-h-tap flex-1 rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:flex-none"
          >
            {status === "saving" ? "Saving…" : declined ? "Save my note" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
