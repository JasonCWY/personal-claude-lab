"use client";

import { useState } from "react";
import { AvailabilityGrid } from "@/components/AvailabilityGrid";
import { DateGrid } from "@/components/DateGrid";
import type { Person } from "@/lib/types";

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
}

export function PollForm({ token, spec, roster, existing, respondedIds }: Props) {
  const [personId, setPersonId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const responded = new Set(respondedIds);

  function pick(person: Person) {
    setPersonId(person.id);
    setSelected(new Set(existing[person.id] ?? []));
    setStatus("idle");
  }

  async function submit() {
    if (!personId) return;
    setStatus("saving");
    try {
      const res = await fetch(`/api/public/s/${token}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          slots: [...selected].map((ms) => new Date(ms).toISOString()),
          comment: comment.trim() || null,
        }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (!personId) {
    return (
      <div>
        <h2 className="mb-3 font-medium">Who are you?</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {roster.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => pick(person)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-medium hover:border-slate-500"
            >
              {person.display_name}
              {responded.has(person.id) && (
                <span className="mt-0.5 block text-xs font-normal text-emerald-700">answered</span>
              )}
            </button>
          ))}
        </div>
        {roster.length === 0 && (
          <p className="text-sm text-slate-500">
            The roster is empty — ask the host to add you before answering.
          </p>
        )}
      </div>
    );
  }

  const me = roster.find((p) => p.id === personId);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          {me?.display_name},{" "}
          {spec.granularity === "date"
            ? "tap the dates that work for you"
            : "drag the times you can make"}
        </h2>
        <button
          type="button"
          onClick={() => setPersonId(null)}
          className="text-sm text-slate-500 underline"
        >
          Not you?
        </button>
      </div>

      <p className="mb-3 text-sm text-slate-600">
        {spec.granularity === "date"
          ? "Tap every date you could do. Tap again to clear one."
          : "Tap or drag to mark yourself free. Drag over green slots again to clear them."}
      </p>

      {spec.granularity === "date" ? (
        <DateGrid spec={spec} selected={selected} onChange={setSelected} />
      ) : (
        <AvailabilityGrid spec={spec} selected={selected} onChange={setSelected} />
      )}

      <div className="mt-4 space-y-3">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional note for the host"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={status === "saving"}
            className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {status === "saving" ? "Saving…" : "Submit"}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-sm text-slate-500 underline"
          >
            Clear all
          </button>
          <span className="text-sm text-slate-500">
            {selected.size} {spec.granularity === "date" ? "dates" : "slots"} selected
          </span>
        </div>

        {status === "saved" && (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
            Saved. You can come back and change this any time before the host books.
          </p>
        )}
        {status === "error" && (
          <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">
            Could not save — check your connection and try again.
          </p>
        )}
      </div>
    </div>
  );
}
