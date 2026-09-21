"use client";

import { useState } from "react";
import { HeatmapGrid } from "@/components/HeatmapGrid";
import type { SlotGridSpec } from "@/lib/slots";
import type { Person } from "@/lib/types";

/**
 * The density grid, scoped to everyone or to one activity.
 *
 * "Six free on Tuesday" and "six BADMINTON players free on Tuesday" are
 * different numbers whenever anyone has unticked an activity, and the heatmap
 * only ever showed the first. That is the more optimistic of the two, which is
 * the wrong way round for a screen the host books a court from: the bookable
 * blocks below already score each activity on its own opted-in subset, so a
 * dark cell up here could sit above "no window yet" down there with nothing
 * explaining the gap. Switching the heatmap to the same subset closes it.
 *
 * Counts arrive precomputed per view. The alternative — shipping every
 * availability row and every opt-out to the browser and intersecting there —
 * would move work to the slowest machine in the chain and put the poll's raw
 * answers in the page source for no gain.
 */
export interface HeatmapView {
  id: string;
  label: string;
  /** slot instant (ms) -> person ids free then, already filtered for this view. */
  counts: [number, string[]][];
  /** Who this view leaves out, named, so a smaller grid explains itself. */
  excluded: string[];
}

export function HeatmapPanel({
  spec,
  views,
  roster,
}: {
  spec: SlotGridSpec;
  views: HeatmapView[];
  roster: Person[];
}) {
  const [activeId, setActiveId] = useState(views[0]?.id ?? "all");
  const active = views.find((v) => v.id === activeId) ?? views[0];
  if (!active) return null;

  return (
    <div>
      {views.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {views.map((view) => {
            const on = view.id === active.id;
            return (
              <button
                key={view.id}
                type="button"
                aria-pressed={on}
                onClick={() => setActiveId(view.id)}
                className={`min-h-tap rounded-lg border px-3 text-sm font-medium transition active:scale-[0.98] ${
                  on
                    ? "border-accent bg-surface-2 text-ink"
                    : "border-line-strong bg-surface text-ink-muted hover:bg-surface-2"
                }`}
              >
                {view.label}
              </button>
            );
          })}
        </div>
      )}

      <HeatmapGrid spec={spec} slotCounts={new Map(active.counts)} roster={roster} />

      {/*
        Only said on an activity view, and only when it actually differs from
        Everyone. A note under the first tab explaining that nobody is excluded
        would be a sentence on every poll that says nothing.
      */}
      {active.id !== views[0]?.id && (
        <p className="mt-2 text-xs text-ink-soft">
          {active.excluded.length === 0
            ? `Everyone who answered is up for ${active.label}, so this matches Everyone.`
            : `Not counted here: ${active.excluded.join(", ")} — free then, but not up for ${
                active.label
              }.`}
        </p>
      )}
    </div>
  );
}
