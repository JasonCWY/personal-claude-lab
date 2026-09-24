"use client";

import { useState } from "react";
import { HeatmapGrid, type SelectedSlot } from "@/components/HeatmapGrid";
import { formatDayHeader } from "@/lib/slots";
import type { SlotGridSpec } from "@/lib/slots";
import type { Person } from "@/lib/types";
import type { HeatmapView } from "@/lib/quorum";

export type { HeatmapView };

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
 * Counts arrive precomputed per view, via `buildHeatmapViews()` in
 * `lib/quorum.ts`. The alternative — shipping every availability row and every
 * opt-out to the browser and intersecting there — would move work to the
 * slowest machine in the chain and put the poll's raw answers in the page
 * source for no gain.
 */

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
  const [selected, setSelected] = useState<SelectedSlot | null>(null);
  const active = views.find((v) => v.id === activeId) ?? views[0];
  if (!active) return null;

  const names = new Map(roster.map((p) => [p.id, p.display_name]));
  // Re-read from the active view on every render rather than snapshotting the
  // people list at selection time, so switching activity tabs with a slot
  // still selected updates who it shows without any extra wiring.
  const selectedPeople = selected ? new Map(active.counts).get(selected.time) ?? [] : null;

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

      <HeatmapGrid
        spec={spec}
        slotCounts={new Map(active.counts)}
        roster={roster}
        selected={selected?.time ?? null}
        onSelectSlot={setSelected}
      />

      {/*
        Panel below the grid, not a popover near the tapped cell — the grid's
        own `overflow-x` scroll container makes a floating popover's position
        unreliable on the axis it doesn't scroll, and this reads fine on a
        phone where the tapped cell is right above it anyway.
      */}
      <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3 text-sm">
        {selected ? (
          <>
            <p className="font-medium text-ink">
              {(() => {
                const { weekday, dayOfMonth, month } = formatDayHeader(selected.date);
                return `${weekday} ${dayOfMonth} ${month}`;
              })()}
              {selected.label && <span className="text-ink-muted"> · {selected.label}</span>}
            </p>
            <p className="mt-1 text-ink-muted">
              {selectedPeople && selectedPeople.length
                ? selectedPeople.map((id) => names.get(id) ?? id).join(", ")
                : "Nobody free then."}
            </p>
          </>
        ) : (
          <p className="text-ink-soft">Tap a cell to see who&apos;s free then.</p>
        )}
      </div>

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
