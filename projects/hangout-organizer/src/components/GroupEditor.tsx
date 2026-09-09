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
        className="min-h-tap rounded-lg py-1 text-sm text-ink-muted underline transition-colors hover:text-ink"
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
          className="w-full min-h-tap rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 sm:max-w-sm"
        />
      )}
      {group && <input type="hidden" name="name" value={group.name} />}

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
          className="inline-flex min-h-tap items-center rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover active:scale-[0.98]"
        >
          {group ? "Save members" : "Create group"}
        </button>
        <span className="text-xs text-ink-soft">{picked.size} selected</span>
        {group && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-2 py-1.5 text-xs text-ink-soft underline transition-colors hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
