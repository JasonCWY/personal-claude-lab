import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addSessionToPoll,
  deletePoll,
  duplicatePoll,
  setPollStatus,
  unconfirmSession,
} from "@/lib/actions";
import { Badge, Button, Card, Empty, ErrorBanner, PageHeader, Select } from "@/components/ui";
import { ShareMessage } from "@/components/ShareMessage";
import { HeatmapGrid } from "@/components/HeatmapGrid";
import { BookableBlocks } from "@/components/BookableBlocks";
import {
  computeCandidates,
  computeSlotCounts,
  groupCandidates,
  overlappingPeople,
  pendingResponders,
} from "@/lib/quorum";
import { formatDuration, formatSpan } from "@/lib/slots";
import { SITE_URL } from "@/lib/env";
import type {
  AvailabilityRow,
  GameSession,
  Person,
  Poll,
  PollResponse,
  RosterGroup,
  Sport,
  Venue,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PollPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const supabase = await createClient();

  const { data: pollData } = await supabase.from("polls").select("*").eq("id", id).single<Poll>();
  if (!pollData) notFound();
  const poll = pollData;

  const [
    { data: sessionData },
    { data: inviteeData },
    { data: availabilityData },
    { data: responseData },
    { data: sportData },
    { data: venueData },
    { data: groupData },
  ] = await Promise.all([
    supabase.from("sessions").select("*").eq("poll_id", id).order("created_at"),
    supabase.from("poll_invitees").select("person_id").eq("poll_id", id),
    supabase.from("availability").select("*").eq("poll_id", id),
    supabase.from("poll_responses").select("*").eq("poll_id", id),
    supabase.from("sports").select("*").order("name"),
    supabase.from("venues").select("*").eq("is_active", true).order("name"),
    poll.group_id
      ? supabase.from("roster_groups").select("*").eq("id", poll.group_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const inviteeIds = (inviteeData ?? []).map((r) => r.person_id as string);
  const { data: peopleData } = inviteeIds.length
    ? await supabase.from("people").select("*").in("id", inviteeIds).order("display_name")
    : { data: [] as Person[] };

  const sessions = (sessionData ?? []) as GameSession[];
  const roster = (peopleData ?? []) as Person[];
  const availability = (availabilityData ?? []) as AvailabilityRow[];
  const responses = (responseData ?? []) as PollResponse[];
  const sports = (sportData ?? []) as Sport[];
  const venues = (venueData ?? []) as Venue[];
  const group = (groupData ?? null) as RosterGroup | null;

  const entries = availability.map((row) => ({
    personId: row.person_id,
    slotStart: new Date(row.slot_start),
  }));
  const slotCounts = computeSlotCounts(entries);
  const pending = pendingResponders(roster, responses.map((r) => r.person_id));
  const names = new Map(roster.map((p) => [p.id, p.display_name]));

  const spec = {
    pollStartDate: poll.poll_start_date,
    pollEndDate: poll.poll_end_date,
    dayStartTime: poll.day_start_time,
    dayEndTime: poll.day_end_time,
    slotMinutes: poll.slot_minutes,
  };

  const shareUrl = `${SITE_URL()}/s/${poll.share_token}`;
  const activityNames = sessions.map((s) => s.title).join(" and ");
  const defaultMessage = [
    `${poll.title} — when are you free?`,
    `${poll.poll_start_date} to ${poll.poll_end_date}, ${poll.day_start_time.slice(0, 5)}–${poll.day_end_time.slice(0, 5)}`,
    activityNames ? `Planning: ${activityNames}` : "",
    poll.notes ?? "",
    "",
    "Tap your name and drag the times you can make:",
  ]
    .filter(Boolean)
    .join("\n");

  // Confirmed bookings across this poll. This check is the reason availability
  // lives on the poll rather than the session: two activities over the same
  // dates can be confirmed into the same hour with the same players, and
  // nothing was previously in a position to notice.
  const confirmed = sessions.filter((s) => s.status === "confirmed" && s.confirmed_start_at);
  const { data: attendeeData } = confirmed.length
    ? await supabase
        .from("attendees")
        .select("*")
        .in(
          "session_id",
          confirmed.map((s) => s.id),
        )
    : { data: [] };

  const attendeesBySession = new Map<string, string[]>();
  for (const a of attendeeData ?? []) {
    const sid = a.session_id as string;
    attendeesBySession.set(sid, [...(attendeesBySession.get(sid) ?? []), a.person_id as string]);
  }

  const clashes: { a: GameSession; b: GameSession; people: string[] }[] = [];
  for (let i = 0; i < confirmed.length; i++) {
    for (let j = i + 1; j < confirmed.length; j++) {
      const shared = overlappingPeople(
        {
          start: new Date(confirmed[i].confirmed_start_at!),
          durationMinutes: confirmed[i].confirmed_duration_minutes ?? 0,
          people: attendeesBySession.get(confirmed[i].id) ?? [],
        },
        {
          start: new Date(confirmed[j].confirmed_start_at!),
          durationMinutes: confirmed[j].confirmed_duration_minutes ?? 0,
          people: attendeesBySession.get(confirmed[j].id) ?? [],
        },
      );
      if (shared.length) clashes.push({ a: confirmed[i], b: confirmed[j], people: shared });
    }
  }

  return (
    <>
      <PageHeader
        title={poll.title}
        subtitle={`${poll.poll_start_date} to ${poll.poll_end_date} · ${poll.day_start_time.slice(0, 5)}–${poll.day_end_time.slice(0, 5)} · ${roster.length} asked${group ? ` (${group.name})` : ""}`}
        action={<Badge tone={poll.status === "polling" ? "amber" : "slate"}>{poll.status}</Badge>}
      />

      <ErrorBanner message={actionError} />

      {clashes.length > 0 && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">These bookings overlap, with the same people in both:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {clashes.map((c, i) => (
              <li key={i}>
                <strong>{c.a.title}</strong> and <strong>{c.b.title}</strong> —{" "}
                {c.people.map((pid) => names.get(pid) ?? pid).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card className="mb-6">
        <h2 className="mb-3 font-medium">Share this poll</h2>
        <ShareMessage url={shareUrl} defaultMessage={defaultMessage} />
      </Card>

      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">
            Who is free — {responses.length} of {roster.length} answered
          </h2>
          {pending.length > 0 && (
            <p className="text-sm text-slate-500">
              Waiting on {pending.map((p) => p.display_name).join(", ")}
            </p>
          )}
        </div>
        {entries.length === 0 ? (
          <Empty>Nobody has answered yet. Paste the link into the group chat.</Empty>
        ) : (
          <HeatmapGrid spec={spec} slotCounts={slotCounts} roster={roster} />
        )}
        {responses.some((r) => r.comment) && (
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {responses
              .filter((r) => r.comment)
              .map((r) => (
                <li key={r.person_id}>
                  {names.get(r.person_id) ?? "Unknown"}
                  <span className="text-slate-500"> — {r.comment}</span>
                </li>
              ))}
          </ul>
        )}
      </Card>

      {sessions.map((session) => {
        const sport = sports.find((s) => s.id === session.sport_id);
        const venue = venues.find((v) => v.id === session.venue_id);
        const blocks = groupCandidates(
          computeCandidates(
            entries,
            {
              minPlayersFull: session.min_players_full,
              fullDurationMinutes: session.full_duration_minutes,
              minPlayersShort: session.min_players_short,
              shortDurationMinutes: session.short_duration_minutes,
            },
            poll.slot_minutes,
          ),
        );

        return (
          <Card key={session.id} className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">{session.title}</h2>
                <p className="text-xs text-slate-500">
                  {sport?.name ?? "Activity"} · {session.min_players_full} →{" "}
                  {formatDuration(session.full_duration_minutes)}, {session.min_players_short} →{" "}
                  {formatDuration(session.short_duration_minutes)}
                </p>
              </div>
              <Badge tone={session.status === "confirmed" ? "green" : "slate"}>
                {session.status}
              </Badge>
            </div>

            {session.status === "confirmed" && session.confirmed_start_at ? (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
                <p className="font-medium text-emerald-900">
                  Booked:{" "}
                  {formatSpan(
                    new Date(session.confirmed_start_at),
                    session.confirmed_duration_minutes ?? 0,
                  )}
                </p>
                <p className="mt-1 text-sm text-emerald-800">
                  {(attendeesBySession.get(session.id) ?? [])
                    .map((pid) => names.get(pid) ?? pid)
                    .join(", ")}
                </p>
                {venue && (
                  <p className="mt-1 text-sm text-emerald-800">
                    {venue.name}
                    {venue.booking_url && (
                      <>
                        {" — "}
                        <a
                          className="underline"
                          href={venue.booking_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          book it
                        </a>
                      </>
                    )}
                  </p>
                )}
                <form action={unconfirmSession} className="mt-3">
                  <input type="hidden" name="id" value={session.id} />
                  <input type="hidden" name="poll_id" value={poll.id} />
                  <button type="submit" className="text-sm text-emerald-900 underline">
                    Unconfirm
                  </button>
                </form>
              </div>
            ) : (
              <BookableBlocks
                sessionId={session.id}
                pollId={poll.id}
                blocks={blocks}
                roster={roster}
                venues={venues.filter((v) => !v.sport_id || v.sport_id === session.sport_id)}
                defaultVenueId={session.venue_id}
                minPlayersFull={session.min_players_full}
                minPlayersShort={session.min_players_short}
              />
            )}
          </Card>
        );
      })}

      <Card className="mb-6">
        <h2 className="mb-3 font-medium">Add another activity</h2>
        <form action={addSessionToPoll} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="poll_id" value={poll.id} />
          <div className="min-w-[12rem]">
            <Select name="sport_id" defaultValue={sports[0]?.id}>
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit">Add</Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          It is scored against the answers already collected — nobody fills anything in again.
        </p>
      </Card>

      <div className="flex flex-wrap gap-4">
        <form action={setPollStatus}>
          <input type="hidden" name="id" value={poll.id} />
          <input
            type="hidden"
            name="status"
            value={poll.status === "polling" ? "closed" : "polling"}
          />
          <button type="submit" className="text-sm text-slate-600 underline">
            {poll.status === "polling" ? "Close the poll" : "Reopen the poll"}
          </button>
        </form>
        <form action={duplicatePoll}>
          <input type="hidden" name="id" value={poll.id} />
          <input type="hidden" name="shift_days" value="7" />
          <button type="submit" className="text-sm text-slate-600 underline">
            Duplicate for next week
          </button>
        </form>
        <form action={deletePoll}>
          <input type="hidden" name="id" value={poll.id} />
          <button type="submit" className="text-sm text-rose-700 underline">
            Delete poll
          </button>
        </form>
      </div>
    </>
  );
}
