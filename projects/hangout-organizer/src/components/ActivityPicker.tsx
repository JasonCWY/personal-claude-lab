"use client";

import { useState } from "react";
import type { Sport, Venue } from "@/lib/types";

/**
 * Which activities this poll is trying to book.
 *
 * More than one is the point: badminton and pickleball over the same dates are
 * two things to book, but only ONE question to ask your friends. Each gets its
 * own quorum rule, both are scored against the same availability, and the poll
 * page can then warn you if confirming both double-books the same people.
 */
export function ActivityPicker({ sports, venues }: { sports: Sport[]; venues: Venue[] }) {
  const [picked, setPicked] = useState<Set<string>>(
    new Set(sports[0] ? [sports[0].id] : []),
  );

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="sm:col-span-2">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        What are you trying to book
      </h2>

      <div className="space-y-2">
        {sports.map((sport) => {
          const on = picked.has(sport.id);
          const forSport = venues.filter((v) => !v.sport_id || v.sport_id === sport.id);
          return (
            <div
              key={sport.id}
              className={`rounded-xl border p-3 ${
                on ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
              }`}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  name="session_sport_ids"
                  value={sport.id}
                  checked={on}
                  onChange={() => toggle(sport.id)}
                />
                <span className="font-medium">{sport.name}</span>
                <span className="text-xs text-slate-500">
                  {sport.min_players_full} → {sport.full_duration_minutes / 60}hr, or{" "}
                  {sport.min_players_short} → {sport.short_duration_minutes / 60}hr
                </span>
              </label>

              {on && forSport.length > 0 && (
                <div className="mt-2 pl-7">
                  <label className="mb-1 block text-xs text-slate-500">
                    Likely venue — optional, you can pick it when you confirm
                  </label>
                  <select
                    name={`venue_${sport.id}`}
                    defaultValue=""
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
                  >
                    <option value="">Decide later</option>
                    {forSport.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Thresholds are copied onto each activity now, so editing the sport later never rewrites a
        poll already running.
      </p>
    </div>
  );
}
