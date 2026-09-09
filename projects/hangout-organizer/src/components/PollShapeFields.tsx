"use client";

import { useState } from "react";
import type { Sport, Venue } from "@/lib/types";

/**
 * The half of the new-poll form that depends on WHAT is being asked.
 *
 * Two shapes:
 *  - "time" — a grid of times within each day. Booking a court.
 *  - "date" — whole days only. "Which dates suit everyone for the trip?"
 *
 * A date poll is a poll whose slot is one day, so the scheduling engine treats
 * it identically; only the questions asked here differ. Durations are given in
 * days and converted to minutes on submit, which is what keeps the engine from
 * needing to know the difference.
 */
export function PollShapeFields({ sports, venues }: { sports: Sport[]; venues: Venue[] }) {
  const [shape, setShape] = useState<"time" | "date">("time");
  const [picked, setPicked] = useState<Set<string>>(new Set(sports[0] ? [sports[0].id] : []));

  return (
    <>
      <input type="hidden" name="granularity" value={shape} />

      <div className="sm:col-span-2">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
          What are you asking
        </h2>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["time", "Times on each day", "For booking a court — half-hour or hourly slots."],
              ["date", "Whole dates only", "For a trip or a weekend — which days suit."],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              onClick={() => setShape(value)}
              className={`min-w-[12rem] flex-1 rounded-xl border p-3 text-left transition active:scale-[0.99] ${
                shape === value
                  ? "border-accent bg-surface-2"
                  : "border-line-strong bg-surface hover:bg-surface-2"
              }`}
            >
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-ink-soft">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      {shape === "time" ? (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-muted">Earliest start</label>
            <input
              type="time"
              name="day_start_time"
              required
              defaultValue="18:00"
              step={900}
              className="w-full min-h-tap rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-muted">Latest end</label>
            <input
              type="time"
              name="day_end_time"
              required
              defaultValue="22:00"
              step={900}
              className="w-full min-h-tap rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
            <p className="mt-1 text-xs text-ink-soft">
              00:00 means the end of that evening. Past midnight is fine.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-muted">Slot size</label>
            <select
              name="slot_minutes"
              defaultValue="60"
              className="w-full min-h-tap rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            >
              <option value="60">60 minutes</option>
              <option value="30">30 minutes</option>
            </select>
            <p className="mt-1 text-xs text-ink-soft">
              Coarser slots mean less to tap on a phone, and courts book by the hour anyway.
            </p>
          </div>
          <div />

          <div className="sm:col-span-2">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
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
                      on ? "border-accent bg-surface-2" : "border-line bg-surface"
                    }`}
                  >
                    <label className="flex min-h-tap cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-ok-solid"
                        name="session_sport_ids"
                        value={sport.id}
                        checked={on}
                        onChange={() =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (next.has(sport.id)) next.delete(sport.id);
                            else next.add(sport.id);
                            return next;
                          })
                        }
                      />
                      <span className="font-medium">{sport.name}</span>
                      <span className="text-xs text-ink-soft">
                        {sport.min_players_full} for {sport.full_duration_minutes / 60}hr, or{" "}
                        {sport.min_players_short} for {sport.short_duration_minutes / 60}hr
                      </span>
                    </label>

                    {on && forSport.length > 0 && (
                      <div className="mt-2 pl-7">
                        <label className="mb-1 block text-xs text-ink-soft">
                          Likely venue — optional
                        </label>
                        <select
                          name={`venue_${sport.id}`}
                          defaultValue=""
                          className="w-full min-h-tap rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 sm:max-w-xs"
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
            <p className="mt-2 text-xs text-ink-soft">
              Thresholds are copied onto each activity now, so editing the sport later never
              rewrites a poll already running.
            </p>
          </div>
        </>
      ) : (
        <div className="sm:col-span-2">
          <input type="hidden" name="day_start_time" value="00:00" />
          <input type="hidden" name="day_end_time" value="00:00" />
          <input type="hidden" name="slot_minutes" value="1440" />

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
            What are you planning
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className="mb-1 block text-sm font-medium text-ink-muted">Name it</label>
              <input
                name="date_activity_title"
                required
                placeholder="e.g. Penang trip"
                className="w-full min-h-tap rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-muted">How many days</label>
              <input
                type="number"
                name="date_full_days"
                min="1"
                max="30"
                defaultValue="3"
                className="w-full min-h-tap rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-muted">
                Need this many people
              </label>
              <input
                type="number"
                name="date_min_players_full"
                min="1"
                defaultValue="4"
                className="w-full min-h-tap rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-muted">Or settle for</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  name="date_min_players_short"
                  min="1"
                  defaultValue="3"
                  aria-label="Fallback number of people"
                  className="w-full min-h-tap rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                />
                <input
                  type="number"
                  name="date_short_days"
                  min="1"
                  max="30"
                  defaultValue="2"
                  aria-label="Fallback number of days"
                  className="w-full min-h-tap rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                />
              </div>
              <p className="mt-1 text-xs text-ink-soft">people / days</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            The app looks for runs of consecutive days that the same people are all free for — the
            same rule as the hourly polls, with a day-sized slot.
          </p>
        </div>
      )}
    </>
  );
}
