import { confirmSession } from "@/lib/actions";
import { Badge, Button, Select } from "@/components/ui";
import { formatDuration, formatKl } from "@/lib/slots";
import type { Candidate } from "@/lib/quorum";
import type { Person, Venue } from "@/lib/types";

/**
 * Bookable windows, best first. Each row is one-click confirmable, which is the
 * whole point — the app should end at "book this", not "here is some data".
 */
export function QuorumSlots({
  sessionId,
  candidates,
  roster,
  venues,
  defaultVenueId,
  minPlayersFull,
  minPlayersShort,
  limit = 8,
}: {
  sessionId: string;
  candidates: Candidate[];
  roster: Person[];
  venues: Venue[];
  defaultVenueId: string | null;
  minPlayersFull: number;
  minPlayersShort: number;
  limit?: number;
}) {
  const names = new Map(roster.map((p) => [p.id, p.display_name]));

  if (candidates.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        No window yet where the same {minPlayersShort} people are free right through. Chase the
        people who have not answered, or widen the polled hours.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {candidates.slice(0, limit).map((c, i) => (
        <div
          key={`${c.start.toISOString()}-${c.durationMinutes}-${i}`}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{formatKl(c.start)}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-700">{formatDuration(c.durationMinutes)}</span>
            {c.tier === "full" ? (
              <Badge tone="green">{c.headcount} in — full session</Badge>
            ) : (
              <Badge tone="amber">
                {c.headcount} in — short session (needs {minPlayersFull} for a full one)
              </Badge>
            )}
          </div>

          <p className="mt-2 text-sm text-slate-600">
            {c.people.map((id) => names.get(id) ?? id).join(", ")}
          </p>

          <form action={confirmSession} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={sessionId} />
            <input type="hidden" name="confirmed_start_at" value={c.start.toISOString()} />
            <input type="hidden" name="confirmed_duration_minutes" value={c.durationMinutes} />
            <input type="hidden" name="people" value={c.people.join(",")} />
            <div className="min-w-[12rem]">
              <Select name="venue_id" defaultValue={defaultVenueId ?? ""}>
                <option value="">No venue</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit">Confirm this slot</Button>
          </form>
        </div>
      ))}

      {candidates.length > limit && (
        <p className="text-xs text-slate-500">
          {candidates.length - limit} more overlapping window
          {candidates.length - limit === 1 ? "" : "s"} not shown.
        </p>
      )}
    </div>
  );
}
