"use client";

import { useState } from "react";
import { saveGroup } from "@/lib/actions";
import type { Person, RosterGroup } from "@/lib/types";

/**
 * Create or edit a roster group.
 *
 * Membership is submitted as the complete list and replaces what was there —
 * the same replace-don't-merge rule the availability grid follows, for the same
 * reason: a form that shows the whole set must be able to remove from it.
 */
export function GroupEditor({
  people,
  group,
  members,
}: {
  people: Person[];
  group?: RosterGroup;
  members?: string[];
}) {
  const [open, setOpen] = useState(!group);
  const [picked, setPicked] = useState<Set<string>>(new Set(members ?? []));

  if (group && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-slate-600 underline"
      >
        Edit members
      </button>
    );
  }

  return (
    <form action={saveGroup} className="mt-3 space-y-3">
      {group && <input type="hidden" name="id" value={group.id} />}

      {!group && (
        <input
          name="name"
          required
          placeholder="Group name, e.g. Badminton regulars"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:max-w-sm"
        />
      )}
      {group && <input type="hidden" name="name" value={group.name} />}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {people.map((p) => {
          const on = picked.has(p.id);
          return (
            <label
              key={p.id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                on ? "border-slate-900 bg-slate-50" : "border-slate-300 bg-white"
              }`}
            >
              <input
                type="checkbox"
                name="member_ids"
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {group ? "Save members" : "Create group"}
        </button>
        <span className="text-xs text-slate-500">{picked.size} selected</span>
        {group && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-slate-500 underline"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
