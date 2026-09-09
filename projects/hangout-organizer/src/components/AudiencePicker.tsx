"use client";

import { useState } from "react";
import type { Person, RosterGroup } from "@/lib/types";

/**
 * Who a poll is addressed to: everyone, a saved group, or a hand-picked list.
 *
 * The resolved people are frozen onto the poll at creation, so editing a group
 * later never changes who a running poll was sent to — the same rule that makes
 * sport thresholds a copy rather than a reference.
 */
export function AudiencePicker({
  people,
  groups,
  memberships,
}: {
  people: Person[];
  groups: RosterGroup[];
  /** group_id -> person_ids, so the preview can be shown without a round trip. */
  memberships: Record<string, string[]>;
}) {
  const [mode, setMode] = useState<"everyone" | "group" | "people">(
    groups.length ? "group" : "everyone",
  );
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const names = new Map(people.map((p) => [p.id, p.display_name]));
  const resolved =
    mode === "everyone"
      ? people.map((p) => p.id)
      : mode === "group"
        ? (memberships[groupId] ?? [])
        : [...picked];

  return (
    <div className="sm:col-span-2">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Who is being asked
      </h2>

      <input type="hidden" name="audience_mode" value={mode} />

      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["everyone", "Everyone active"],
            ["group", "A group"],
            ["people", "Pick people"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`min-h-tap rounded-lg border px-3 py-1.5 text-sm font-medium transition active:scale-[0.98] ${
              mode === value
                ? "border-accent bg-accent text-accent-fg"
                : "border-line-strong bg-surface hover:bg-surface-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "group" && (
        <div>
          {groups.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No groups yet — create one on the Roster page, or pick people individually.
            </p>
          ) : (
            <select
              name="group_id"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full min-h-tap rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 sm:max-w-xs"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({(memberships[g.id] ?? []).length})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {mode === "people" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {people.map((p) => {
            const on = picked.has(p.id);
            return (
              <label
                key={p.id}
                className={`flex min-h-tap cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  on ? "border-accent bg-surface-2" : "border-line-strong bg-surface"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-ok-solid"
                  name="person_ids"
                  value={p.id}
                  checked={on}
                  onChange={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    })
                  }
                />
                {p.display_name}
              </label>
            );
          })}
        </div>
      )}

      <p className="mt-2 text-xs text-ink-soft">
        {resolved.length === 0
          ? "Nobody selected yet."
          : `${resolved.length} ${resolved.length === 1 ? "person" : "people"}: ${resolved
              .map((id) => names.get(id) ?? id)
              .join(", ")}`}
      </p>
    </div>
  );
}
