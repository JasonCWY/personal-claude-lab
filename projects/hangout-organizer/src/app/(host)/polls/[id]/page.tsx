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
import { ResponseSummary } from "@/components/ResponseSummary";
import { BookableBlocks } from "@/components/BookableBlocks";
import {
  computeCandidates,
  computeSlotCounts,
  groupCandidates,
  overlappingPeople,
} from "@/lib/quorum";
import { formatDateSpan, formatDays, formatDuration, formatSpan } from "@/lib/slots";
import { SITE_URL } from "@/lib/env";
import type {
  AvailabilityRow,
  GameSession,
  Person,
  Poll,
  PollResponse,
  RosterGroup,
  SessionOptOut,
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

  // Two round trips, not five. Everything keyed off the poll ID from the URL
  // goes out at once — the poll row is not a prerequisite for any of it — and
  // the second wave is only the queries that genuinely need an ID list from the
  // first. This page used to be five sequential Supabase hops before a single
  // byte of HTML was produced, and that stack of latency was most of the wait.
  const [
    { data: pollData },
    { data: sessionData },
    { data: inviteeData },
    { data: availabilityData },
    { data: responseData },
    { data: sportData },
    { data: venueData },
  ] = await Promise.all([
    supabase.from("polls").select("*").eq("id", id).maybeSingle<Poll>(),
    supabase.from("sessions").select("*").eq("poll_id", id).order("created_at"),
    supabase.from("poll_invitees").select("person_id").eq("poll_id", id),
    supabase.from("availability").select("person_id, slot_start").eq("poll_id", id),
    supabase.from("poll_responses").select("*").eq("poll_id", id),
    supabase.from("sports").select("*").order("name"),
    supabase.from("venues").select("*").eq("is_active", true).order("name"),
  ]);

  if (!pollData) notFound();
  const poll = pollData;

  const sessions = (sessionData ?? []) as GameSession[];
  const availability = (availabilityData ?? []) as AvailabilityRow[];
  const responses = (responseData ?? []) as PollResponse[];
  const sports = (sportData ?? []) as Sport[];
  const venues = (venueData ?? []) as Venue[];

  const inviteeIds = (inviteeData ?? []).map((r) => r.person_id as string);
  const sessionIds = sessions.map((s) => s.id);
  // Attendees are only read for sessions that got confirmed.
  const confirmed = sessions.filter((s) => s.status === "confirmed" && s.confirmed_start_at);

  const [
    { data: peopleData },
    { data: optOutData },
    { data: attendeeData },
    { data: groupData },
  ] = await Promise.all([
    inviteeIds.length
      ? supabase.from("people").select("*").in("id", inviteeIds).order("display_name")
      : Promise.resolve({ data: [] as Person[] }),
    // Who said "not this one" about which activity. Absence means in, so an
    // activity added mid-poll counts everyone until they say otherwise.
    sessionIds.length
      ? supabase.from("session_optouts").select("*").in("session_id", sessionIds)
      : Promise.resolve({ data: [] as SessionOptOut[] }),
    confirmed.length
      ? supabase
          .from("attendees")
          .select("session_id, person_id")
          .in(
            "session_id",
            confirmed.map((s) => s.id),
          )
      : Promise.resolve({ data: [] as { session_id: string; person_id: string }[] }),
    poll.group_id
      ? supabase.from("roster_groups").select("*").eq("id", poll.group_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const roster = (peopleData ?? []) as Person[];
  const group = (groupData ?? null) as RosterGroup | null;

  const entries = availability.map((row) => ({
    personId: row.person_id,
    slotStart: new Date(row.slot_start),
  }));
  const slotCounts = computeSlotCounts(entries);

  const optOutsBySession = new Map<string, Set<string>>();
  for (const row of (optOutData ?? []) as SessionOptOut[]) {
    const set = optOutsBySession.get(row.session_id) ?? new Set<string>();
    set.add(row.person_id);
    optOutsBySession.set(row.session_id, set);
  }
  const names = new Map(roster.map((p) => [p.id, p.display_name]));

  // A decline is an answer, so these people are not in `pending` — the host has
  // heard from them and should not chase them. But they contribute no
  // availability, so without naming them here the host sees "6 of 8 answered"
  // over a thin heatmap and cannot tell whether the missing two are a quiet no
  // or a poll that simply has not landed yet.
  const declinedIds = new Set(responses.filter((r) => r.declined).map((r) => r.person_id));

  // How many slots each person marked. "Answered" is not one thing: two slots
  // and twenty are both answers, and the gap between them is most of why a
  // window fails to reach quorum, so the summary shows the number.
  const slotsByPerson = new Map<string, number>();
  for (const row of availability) {
    slotsByPerson.set(row.person_id, (slotsByPerson.get(row.person_id) ?? 0) + 1);
  }

  const byDate = poll.granularity === "date";

  const spec = {
    pollStartDate: poll.poll_start_date,
    pollEndDate: poll.poll_end_date,
    granularity: poll.granularity,
    dayStartTime: poll.day_start_time,
    dayEndTime: poll.day_end_time,
    slotMinutes: poll.slot_minutes,
  };

  const shareUrl = `${SITE_URL()}/s/${poll.share_token}`;
  const activityNames = sessions.map((s) => s.title).join(" and ");
  const defaultMessage = [
    `${poll.title} — when are you free?`,
    byDate
      ? `${poll.poll_start_date} to ${poll.poll_end_date}`
      : `${poll.poll_start_date} to ${poll.poll_end_date}, ${poll.day_start_time.slice(0, 5)}–${poll.day_end_time.slice(0, 5)}`,
    activityNames ? `Planning: ${activityNames}` : "",
    poll.notes ?? "",
    "",
    byDate
      ? "Tap your name, then the dates that work for you:"
      : "Tap your name and drag the times you can make:",
  ]
    .filter(Boolean)
    .join("\n");

  // Clashes across this poll's confirmed bookings. This check is the reason
  // availability lives on the poll rather than the session: two activities over
  // the same dates can be confirmed into the same hour with the same players,
  // and nothing was previously in a position to notice.
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
        subtitle={`${poll.poll_start_date} to ${poll.poll_end_date}${
          byDate ? " · whole dates" : ` · ${poll.day_start_time.slice(0, 5)}–${poll.day_end_time.slice(0, 5)}`
        } · ${roster.length} asked${group ? ` (${group.name})` : ""}`}
        action={<Badge tone={poll.status === "polling" ? "amber" : "slate"}>{poll.status}</Badge>}
      />

      <ErrorBanner message={actionError} />

      {clashes.length > 0 && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-warn-border bg-warn-bg p-4 text-sm text-warn-fg"
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
            Who is free{" "}
            <span className="font-normal text-ink-soft">
              — {responses.length} of {roster.length} answered
            </span>
          </h2>
        </div>

        <ResponseSummary
          roster={roster}
          responses={responses}
          slotsByPerson={slotsByPerson}
          byDate={byDate}
        />

        {entries.length === 0 ? (
          <Empty>
            {responses.length === 0
              ? "Nobody has answered yet. Paste the link into the group chat."
              : "Everyone who has answered said they cannot make this window. Widen the dates or the hours."}
          </Empty>
        ) : (
          <HeatmapGrid spec={spec} slotCounts={slotCounts} roster={roster} />
        )}
      </Card>

      {sessions.map((session) => {
        const sport = sports.find((s) => s.id === session.sport_id);
        const venue = venues.find((v) => v.id === session.venue_id);

        // Someone free on Tuesday is not thereby a pickleball player. Only
        // people who left this activity ticked count toward its quorum.
        const optedOut = optOutsBySession.get(session.id) ?? new Set<string>();
        const sessionEntries = entries.filter((e) => !optedOut.has(e.personId));
        const optedOutNames = [...optedOut].map((pid) => names.get(pid) ?? pid).sort();

        // People who answered before this activity was added never saw it, so
        // they are being counted without having said yes. Worth naming.
        const answeredBefore = responses
          .filter(
            (r) =>
              r.submitted_at < session.created_at &&
              !optedOut.has(r.person_id) &&
              // Someone who declined the whole window contributes no times, so
              // they are not being counted for this activity and naming them
              // here would send the host chasing a question already answered.
              !declinedIds.has(r.person_id),
          )
          .map((r) => names.get(r.person_id) ?? r.person_id)
          .sort();

        const blocks = groupCandidates(
          computeCandidates(
            sessionEntries,
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
                <p className="text-xs text-ink-soft">
                  {sport?.name ?? "Trip"} · {session.min_players_full} →{" "}
                  {byDate
                    ? formatDays(session.full_duration_minutes)
                    : formatDuration(session.full_duration_minutes)}
                  , {session.min_players_short} →{" "}
                  {byDate
                    ? formatDays(session.short_duration_minutes)
                    : formatDuration(session.short_duration_minutes)}
                </p>
              </div>
              <Badge tone={session.status === "confirmed" ? "green" : "slate"}>
                {session.status}
              </Badge>
            </div>

            {sessions.length > 1 && (optedOutNames.length > 0 || answeredBefore.length > 0) && (
              <div className="mb-3 space-y-1 text-xs">
                {optedOutNames.length > 0 && (
                  <p className="text-ink-soft">
                    Not up for this: {optedOutNames.join(", ")} — their times are excluded here.
                  </p>
                )}
                {answeredBefore.length > 0 && (
                  <p className="text-warn-fg">
                    {answeredBefore.join(", ")} answered before this activity was added, so they
                    are counted without having said yes to it.
                  </p>
                )}
              </div>
            )}

            {session.status === "confirmed" && session.confirmed_start_at ? (
              <div className="rounded-xl border border-ok-border bg-ok-bg p-4">
                <p className="font-medium text-ok-fg">
                  Booked:{" "}
                  {byDate
                    ? formatDateSpan(
                        new Date(session.confirmed_start_at),
                        session.confirmed_duration_minutes ?? 0,
                      )
                    : formatSpan(
                        new Date(session.confirmed_start_at),
                        session.confirmed_duration_minutes ?? 0,
                      )}
                </p>
                <p className="mt-1 text-sm text-ok-fg">
                  {(attendeesBySession.get(session.id) ?? [])
                    .map((pid) => names.get(pid) ?? pid)
                    .join(", ")}
                </p>
                {venue && (
                  <p className="mt-1 text-sm text-ok-fg">
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
                  <button type="submit" className="min-h-tap rounded-lg px-1 text-sm text-ok-fg underline transition-colors hover:brightness-110">
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
                byDate={byDate}
              />
            )}
          </Card>
        );
      })}

      {!byDate && (
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
        <p className="mt-2 text-xs text-ink-soft">
          It is scored against the answers already collected — nobody fills anything in again.
        </p>
      </Card>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <form action={setPollStatus}>
          <input type="hidden" name="id" value={poll.id} />
          <input
            type="hidden"
            name="status"
            value={poll.status === "polling" ? "closed" : "polling"}
          />
          <button type="submit" className="min-h-tap rounded-lg px-1 text-sm text-ink-muted underline transition-colors hover:text-ink">
            {poll.status === "polling" ? "Close the poll" : "Reopen the poll"}
          </button>
        </form>
        <form action={duplicatePoll}>
          <input type="hidden" name="id" value={poll.id} />
          <input type="hidden" name="shift_days" value="7" />
          <button type="submit" className="min-h-tap rounded-lg px-1 text-sm text-ink-muted underline transition-colors hover:text-ink">
            Duplicate for next week
          </button>
        </form>
        <form action={deletePoll}>
          <input type="hidden" name="id" value={poll.id} />
          <button type="submit" className="min-h-tap rounded-lg px-1 text-sm text-bad-fg underline transition-colors hover:brightness-110">
            Delete poll
          </button>
        </form>
      </div>
    </>
  );
}
