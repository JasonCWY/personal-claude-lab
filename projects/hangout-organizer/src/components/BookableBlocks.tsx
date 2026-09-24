import { confirmSession } from "@/lib/actions";
import { Badge, Button, Input, Select } from "@/components/ui";
import {
  DAY_MINUTES,
  formatDateSpan,
  formatDayHeader,
  formatDays,
  formatDuration,
  formatSpan,
  instantToKl,
} from "@/lib/slots";
import type { CandidateBlock } from "@/lib/quorum";
import type { Person, Venue } from "@/lib/types";

/**
 * Bookable windows, drawn as bars on a per-day timeline.
 *
 * The old list showed one row per qualifying start, so a single 3-hour free
 * stretch appeared as five near-identical options and read as noise. These are
 * grouped blocks (see quorum.groupCandidates): one bar per stretch of time,
 * with the start times offered inside it. The host makes one decision — which
 * evening — and then a smaller one about when to begin.
 */
export function BookableBlocks({
  sessionId,
  pollId,
  blocks,
  roster,
  venues,
  defaultVenueId,
  minPlayersFull,
  minPlayersShort,
  byDate = false,
}: {
  sessionId: string;
  pollId: string;
  blocks: CandidateBlock[];
  roster: Person[];
  venues: Venue[];
  defaultVenueId: string | null;
  minPlayersFull: number;
  minPlayersShort: number;
  /** Date poll: windows are runs of whole days, so read them in days. */
  byDate?: boolean;
}) {
  const names = new Map(roster.map((p) => [p.id, p.display_name]));

  if (blocks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-ink-soft">
        No {byDate ? "run of dates" : "window"} yet where the same {minPlayersShort} people are
        free right through. Chase whoever has not answered, or widen the{" "}
        {byDate ? "date range" : "polled hours"}.
      </p>
    );
  }

  // One row per day that has blocks, so the shape of the week is visible.
  const byDay = new Map<string, CandidateBlock[]>();
  for (const b of blocks) {
    const day = instantToKl(b.start).date;
    byDay.set(day, [...(byDay.get(day) ?? []), b]);
  }

  // A shared scale across all days, so bars are comparable by eye.
  const dayStartMin = Math.min(
    ...blocks.map((b) => {
      const { time } = instantToKl(b.start);
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    }),
  );
  const dayEndMin = Math.max(
    ...blocks.map((b) => {
      const { time } = instantToKl(b.end);
      const [h, m] = time.split(":").map(Number);
      const mins = h * 60 + m;
      // An end of 00:00 belongs at the far right, not the far left.
      return mins === 0 ? 24 * 60 : mins;
    }),
  );
  const span = Math.max(60, dayEndMin - dayStartMin);

  function bar(b: CandidateBlock): { left: string; width: string } {
    const s = instantToKl(b.start).time.split(":").map(Number);
    const e = instantToKl(b.end).time.split(":").map(Number);
    const startMin = s[0] * 60 + s[1];
    const endMinRaw = e[0] * 60 + e[1];
    const endMin = endMinRaw === 0 ? 24 * 60 : endMinRaw;
    return {
      left: `${((startMin - dayStartMin) / span) * 100}%`,
      width: `${Math.max(6, ((endMin - startMin) / span) * 100)}%`,
    };
  }

  if (byDate) {
    return (
      <div className="space-y-3">
        {blocks.map((b, i) => (
          <BlockRow
            key={i}
            block={b}
            sessionId={sessionId}
            pollId={pollId}
            names={names}
            venues={venues}
            defaultVenueId={defaultVenueId}
            minPlayersFull={minPlayersFull}
            byDate
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {[...byDay.entries()].map(([day, dayBlocks]) => {
        const { weekday, dayOfMonth, month } = formatDayHeader(day);
        return (
          <div key={day}>
            <h4 className="mb-2 text-sm font-semibold text-ink-muted">
              {weekday} {dayOfMonth} {month}
            </h4>

            <div className="relative mb-3 h-7 rounded-lg bg-surface-2">
              {dayBlocks.map((b, i) => {
                const { left, width } = bar(b);
                return (
                  <div
                    key={i}
                    style={{ left, width }}
                    title={`${formatSpan(b.start, (b.end.getTime() - b.start.getTime()) / 60000)} — ${b.headcount} free`}
                    className={`absolute top-1 flex h-5 items-center justify-center rounded text-[0.65rem] font-medium ${
                      b.tier === "full"
                        ? "bg-ok-solid text-ok-solid-fg"
                        : "bg-warn-solid text-warn-solid-fg"
                    }`}
                  >
                    {b.headcount}
                  </div>
                );
              })}
            </div>

            <div className="space-y-3">
              {dayBlocks.map((b, i) => (
                <BlockRow
                  key={i}
                  block={b}
                  sessionId={sessionId}
                  pollId={pollId}
                  names={names}
                  venues={venues}
                  defaultVenueId={defaultVenueId}
                  minPlayersFull={minPlayersFull}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BlockRow({
  block,
  sessionId,
  pollId,
  names,
  venues,
  defaultVenueId,
  minPlayersFull,
  byDate = false,
}: {
  block: CandidateBlock;
  sessionId: string;
  pollId: string;
  names: Map<string, string>;
  venues: Venue[];
  defaultVenueId: string | null;
  minPlayersFull: number;
  byDate?: boolean;
}) {
  const stretchMinutes = (block.end.getTime() - block.start.getTime()) / 60000;
  const latitude = block.starts.length > 1;

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {byDate
            ? formatDateSpan(block.start, stretchMinutes)
            : formatSpan(block.start, stretchMinutes)}
        </span>
        {block.tier === "full" ? (
          <Badge tone="green">{block.headcount} free — full session</Badge>
        ) : (
          <Badge tone="amber">
            {block.headcount} free — short session (needs {minPlayersFull} for a full one)
          </Badge>
        )}
      </div>

      <p className="mt-1 text-xs text-ink-soft">
        {byDate ? "Take " : "Book "}
        {byDate ? formatDays(block.durationMinutes) : formatDuration(block.durationMinutes)}
        {latitude
          ? ` — ${block.starts.length} possible start ${byDate ? "dates" : "times"} inside this stretch`
          : " — only one start fits"}
      </p>

      <p className="mt-2 text-sm text-ink-muted">
        {block.people.map((id) => names.get(id) ?? id).join(", ")}
      </p>

      <form action={confirmSession} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={sessionId} />
        <input type="hidden" name="poll_id" value={pollId} />
        <input type="hidden" name="confirmed_duration_minutes" value={block.durationMinutes} />
        <input type="hidden" name="people" value={block.people.join(",")} />

        <div className="min-w-[11rem]">
          <label className="mb-1 block text-xs text-ink-soft">Start at</label>
          <Select name="confirmed_start_at" defaultValue={block.starts[0].toISOString()}>
            {block.starts.map((s) => (
              <option key={s.toISOString()} value={s.toISOString()}>
                {instantToKl(s).time} – {instantToKl(new Date(s.getTime() + block.durationMinutes * 60000)).time}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-[11rem]">
          <label className="mb-1 block text-xs text-ink-soft">Venue</label>
          <Select name="venue_id" defaultValue={defaultVenueId ?? ""}>
            <option value="">No venue</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-[8rem]">
          {/* Optional, because it is often not known until the booking page
              confirms it — and refusing to confirm without it would be the
              worse trade. Free text: venues label courts "3", "A2", "Hall 2". */}
          <label className="mb-1 block text-xs text-ink-soft">Court</label>
          <Input name="court_number" placeholder="Optional" maxLength={40} />
        </div>

        <Button type="submit">Confirm</Button>
      </form>

      {/*
        A second, independent form for when none of the computed candidates
        match reality — the court is only free from 20:15, not 20:00.
        Disambiguated server-side by which field is present
        (confirmed_start_at_local vs confirmed_start_at), so no shared client
        state is needed between the two forms.
      */}
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-ink-soft underline">
          Use a custom time instead
        </summary>
        <form action={confirmSession} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={sessionId} />
          <input type="hidden" name="poll_id" value={pollId} />
          <input type="hidden" name="people" value={block.people.join(",")} />

          <div className="min-w-[11rem]">
            <label className="mb-1 block text-xs text-ink-soft">Start at</label>
            <Input type="datetime-local" name="confirmed_start_at_local" required />
          </div>

          <div className="min-w-[7rem]">
            <label className="mb-1 block text-xs text-ink-soft">Minutes</label>
            <Input
              type="number"
              name="confirmed_duration_minutes"
              min={15}
              step={5}
              defaultValue={block.durationMinutes}
              required
            />
          </div>

          <div className="min-w-[11rem]">
            <label className="mb-1 block text-xs text-ink-soft">Venue</label>
            <Select name="venue_id" defaultValue={defaultVenueId ?? ""}>
              <option value="">No venue</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-[8rem]">
            <label className="mb-1 block text-xs text-ink-soft">Court</label>
            <Input name="court_number" placeholder="Optional" maxLength={40} />
          </div>

          <Button type="submit">Confirm custom time</Button>
        </form>
      </details>
    </div>
  );
}
