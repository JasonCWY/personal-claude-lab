import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { PollForm } from "@/components/PollForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  formatDateList,
  formatDateSpan,
  formatDays,
  formatDuration,
  formatKl,
  formatSpan,
  pollDates,
  windowsFromRows,
} from "@/lib/slots";
import { formatTimeLeft, pollClosedReason } from "@/lib/poll-state";
import type {
  AvailabilityRow,
  GameSession,
  Person,
  Poll,
  PollResponse,
  SessionOptOut,
  Venue,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/*
 * One query, two readers. generateMetadata runs before the page renders, and a
 * second look-up here would put an extra Tokyo round trip on the friend-facing
 * page — the one opened from a phone on mobile data, where this file already
 * goes out of its way to avoid avoidable hops. React's cache() dedupes within
 * a request, so the unfurl and the page share the same row.
 */
const getPoll = cache(async (token: string) => {
  const { data } = await createServiceClient()
    .from("polls")
    .select("*")
    .eq("share_token", token)
    .maybeSingle<Poll>();
  return data;
});

/**
 * The dates and hours this poll asks about.
 *
 * Cached for the same reason as the poll itself: the link preview needs the
 * dates to say what it is inviting people to, and so does the page, and a
 * second look-up would be another Tokyo round trip on the one page in this app
 * that is opened on mobile data by someone who has never seen it.
 */
const getWindows = cache(async (pollId: string) => {
  const { data } = await createServiceClient()
    .from("poll_windows")
    .select("day_date, start_time, end_time")
    .eq("poll_id", pollId)
    .order("day_date")
    .order("start_time");
  return (data ?? []) as {
    day_date: string;
    start_time: string | null;
    end_time: string | null;
  }[];
});

/**
 * What WhatsApp shows when the host pastes the link.
 *
 * Every share link used to unfurl as "Hangout Organizer" with the app's generic
 * description — the same card for every poll, in the one place where the link
 * is actually seen. The preview now carries the poll and its dates, so the
 * message reads as an invitation before anyone taps it.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const poll = await getPoll(token);
  if (!poll) return { title: "Poll not found" };

  // The dates this poll actually asks about, not its outer bounds: three
  // scattered Tuesdays must not unfurl as a fortnight-long range in WhatsApp,
  // which is where this link is read before anyone taps it.
  const windows = await getWindows(poll.id);
  const when = formatDateList(pollDates(windowsFromRows(windows)));

  const title =
    poll.status === "polling" ? `${poll.title} — when are you free?` : poll.title;
  const description =
    poll.status === "polling"
      ? `${when}. Tap your name and mark when you can make it.`
      : `${when}. This poll has closed.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

/**
 * PUBLIC page — no login. Reads run on the secret-key client, scoped by the
 * share token, because friends have no Supabase session and RLS grants `anon`
 * nothing. The token is the only credential, so nothing is exposed here beyond
 * the poll itself and the first names of the people invited to it.
 *
 * Only the poll's invitees are listed, not the whole roster — a poll sent to
 * the badminton group should not show, or accept an answer from, anyone else.
 */
export default async function PublicPollPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceClient();

  const poll = await getPoll(token);
  if (!poll) notFound();

  const [
    { data: inviteeData },
    { data: availabilityData },
    { data: responseData },
    { data: sessionData },
  ] = await Promise.all([
    supabase.from("poll_invitees").select("person_id").eq("poll_id", poll.id),
    supabase.from("availability").select("person_id, slot_start").eq("poll_id", poll.id),
    supabase
      .from("poll_responses")
      .select("person_id, declined, party_size")
      .eq("poll_id", poll.id),
    supabase.from("sessions").select("*").eq("poll_id", poll.id).order("created_at"),
  ]);

  const inviteeIds = (inviteeData ?? []).map((r) => r.person_id as string);
  const sessions = (sessionData ?? []) as GameSession[];
  const booked = sessions.filter((s) => s.status === "confirmed" && s.confirmed_start_at);
  // Called off this week — no booking coming, so it stops demanding a
  // headcount and stops counting toward "Ask the host for details."
  const calledOff = sessions.filter((s) => s.status === "cancelled");
  const bookedVenueIds = [...new Set(booked.map((s) => s.venue_id).filter(Boolean))] as string[];

  // The roster and the opt-outs each need an ID list from the wave above, but
  // not from each other — so they go out together rather than one after the
  // other. This is the friend-facing page, opened from a phone on mobile data,
  // where every avoidable round trip is felt.
  const [{ data: peopleData }, { data: optOutData }, { data: attendeeData }, { data: venueData }] =
    await Promise.all([
    // Deliberately NOT filtered to active people. The form needs the active
    // ones, but the attendee list below has to be able to name someone who was
    // deactivated after the booking was confirmed — otherwise they vanish from
    // a list they are still turning up to. One query, filtered twice below.
    inviteeIds.length
      ? supabase.from("people").select("*").in("id", inviteeIds).order("display_name")
      : Promise.resolve({ data: [] as Person[] }),
    // Which activities each person has said they are not up for, so returning
    // to the link shows their previous answer rather than resetting it.
    sessions.length
      ? supabase
          .from("session_optouts")
          .select("*")
          .in(
            "session_id",
            sessions.map((s) => s.id),
          )
      : Promise.resolve({ data: [] as SessionOptOut[] }),
    // Who the host snapshotted as coming when they confirmed. Both of these
    // ride in this wave rather than a third one — the friend-facing page is
    // opened on mobile data and every avoidable round trip is felt.
    booked.length
      ? supabase
          .from("attendees")
          .select("session_id, person_id")
          .in(
            "session_id",
            booked.map((s) => s.id),
          )
      : Promise.resolve({ data: [] as { session_id: string; person_id: string }[] }),
    bookedVenueIds.length
      ? supabase.from("venues").select("*").in("id", bookedVenueIds)
      : Promise.resolve({ data: [] as Venue[] }),
  ]);

  const invitees = (peopleData ?? []) as Person[];
  // The form only ever offers, and the route only ever accepts, active people.
  const roster = invitees.filter((p) => p.is_active);
  const nameById = new Map(invitees.map((p) => [p.id, p.display_name]));
  const venueById = new Map(((venueData ?? []) as Venue[]).map((v) => [v.id, v]));

  const attendeesBySession = new Map<string, string[]>();
  for (const row of (attendeeData ?? []) as { session_id: string; person_id: string }[]) {
    attendeesBySession.set(row.session_id, [
      ...(attendeesBySession.get(row.session_id) ?? []),
      row.person_id,
    ]);
  }

  const existing: Record<string, number[]> = {};
  for (const row of (availabilityData ?? []) as AvailabilityRow[]) {
    (existing[row.person_id] ??= []).push(new Date(row.slot_start).getTime());
  }

  // Who has already said none of the dates work, so returning to the link shows
  // that back rather than a blank grid that looks like they never answered.
  const responses = (responseData ?? []) as PollResponse[];
  const declinedIds = responses.filter((r) => r.declined).map((r) => r.person_id);

  // Reopening the link has to show back what you said last time, guest count
  // included — otherwise editing a note silently resets your party to one.
  const existingPartySizes: Record<string, number> = {};
  for (const r of responses) existingPartySizes[r.person_id] = r.party_size ?? 1;

  const existingOptOuts: Record<string, string[]> = {};
  for (const row of (optOutData ?? []) as SessionOptOut[]) {
    (existingOptOuts[row.person_id] ??= []).push(row.session_id);
  }

  const byDate = poll.granularity === 'date';

  const windows = windowsFromRows(await getWindows(poll.id));
  const spec = {
    granularity: poll.granularity,
    slotMinutes: poll.slot_minutes,
    windows,
  };

  // One source of truth with the submit route: a poll past its cut-off is shut
  // here and shut there, and the page never invites an answer the endpoint is
  // about to refuse.
  const closedReason = pollClosedReason(poll);
  const closed = closedReason !== null;
  const timeLeft = formatTimeLeft(poll);

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-6">
      {/*
        The toggle is on the friend-facing pages too, not just the host's: these
        are the links opened from a group chat late at night, and they are the
        screens in this app most likely to be read in the dark.
      */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{poll.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {formatDateList(pollDates(windows))}
          </p>
        </div>
        <ThemeToggle className="hidden shrink-0 sm:flex" />
      </div>

      {sessions.filter((s) => s.status !== "cancelled").length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-ink-soft">
          {sessions
            .filter((s) => s.status !== "cancelled")
            .map((s) => (
              <li key={s.id}>
                <span className="font-medium text-ink-muted">{s.title}</span> — need{" "}
                {s.min_players_full} for{" "}
                {byDate ? formatDays(s.full_duration_minutes) : formatDuration(s.full_duration_minutes)}
                , or {s.min_players_short} for{" "}
                {byDate
                  ? formatDays(s.short_duration_minutes)
                  : formatDuration(s.short_duration_minutes)}
              </li>
            ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-ink-soft">
        Answer once — it counts for everything listed above. All times Malaysia time.
      </p>

      {calledOff.length > 0 && (
        <div className="mt-3 space-y-2">
          {calledOff.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-dashed border-line-strong bg-surface-2 p-3"
            >
              <p className="text-sm font-medium text-ink-muted">No {s.title} this week</p>
              {s.notes && <p className="mt-1 text-xs text-ink-soft">{s.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {poll.notes && <p className="mt-3 text-sm text-ink-muted">{poll.notes}</p>}

      {!closed && timeLeft && (
        <p className="mt-3 rounded-lg border border-warn-border bg-warn-bg p-3 text-sm text-warn-fg">
          Answer within about {timeLeft} — this poll closes on {formatKl(new Date(poll.closes_at!))}
          , after which the link stops taking answers.
        </p>
      )}

      <div className="mt-6 rounded-xl border border-line bg-surface p-4 shadow-sm">
        {closed ? (
          <div>
            <h2 className="font-medium">
              {closedReason === "cut-off"
                ? "Answering has closed."
                : "This poll is closed."}
            </h2>
            {closedReason === "cut-off" && booked.length === 0 && (
              <p className="mt-1 text-sm text-ink-soft">
                The deadline was {formatKl(new Date(poll.closes_at!))}.
              </p>
            )}
            {booked.length > 0 ? (
              /*
               * The point of the page after a booking is made. Until now it
               * said only the title and the time, which is the half of it
               * everyone already knew from the group chat — the questions
               * actually asked on the day are "where", "which court" and "who
               * else is coming", and the host was answering all three by hand.
               */
              <div className="mt-3 space-y-3">
                {booked.map((s) => {
                  const venue = s.venue_id ? venueById.get(s.venue_id) : undefined;
                  const going = (attendeesBySession.get(s.id) ?? [])
                    .map((id) => nameById.get(id))
                    .filter(Boolean)
                    .sort() as string[];
                  return (
                    <div key={s.id} className="rounded-xl border border-ok-border bg-ok-bg p-3">
                      <p className="font-medium text-ok-fg">{s.title}</p>
                      <p className="mt-0.5 text-sm text-ok-fg">
                        {byDate
                          ? formatDateSpan(
                              new Date(s.confirmed_start_at!),
                              s.confirmed_duration_minutes ?? 0,
                            )
                          : formatSpan(
                              new Date(s.confirmed_start_at!),
                              s.confirmed_duration_minutes ?? 0,
                            )}
                      </p>

                      {(venue || s.court_number) && (
                        <p className="mt-2 text-sm text-ink-muted">
                          {venue && <span className="font-medium text-ink">{venue.name}</span>}
                          {venue && s.court_number ? " · " : ""}
                          {s.court_number && (
                            <span className="font-medium text-ink">Court {s.court_number}</span>
                          )}
                          {venue?.address && (
                            <span className="mt-0.5 block text-xs text-ink-soft">
                              {venue.address}
                            </span>
                          )}
                        </p>
                      )}

                      {going.length > 0 && (
                        <p className="mt-2 text-sm text-ink-muted">
                          <span className="text-xs uppercase tracking-wide text-ink-soft">
                            Going
                          </span>
                          <span className="mt-0.5 block">
                            {going.join(", ")}
                            {/* Guests were counted into the booking, so they
                                are counted into the list of who to expect. */}
                            {(() => {
                              const guests = (attendeesBySession.get(s.id) ?? []).reduce(
                                (n, id) => n + Math.max(0, (existingPartySizes[id] ?? 1) - 1),
                                0,
                              );
                              return guests > 0
                                ? ` + ${guests} guest${guests === 1 ? "" : "s"}`
                                : "";
                            })()}
                          </span>
                        </p>
                      )}

                      {s.notes && <p className="mt-2 text-sm text-ink-muted">{s.notes}</p>}
                    </div>
                  );
                })}
              </div>
            ) : (
              sessions.some((s) => s.status === "planning") && (
                <p className="mt-2 text-sm text-ink-muted">Ask the host for details.</p>
              )
            )}
          </div>
        ) : (
          <PollForm
            token={token}
            spec={spec}
            roster={roster}
            existing={existing}
            respondedIds={responses.map((r) => r.person_id)}
            declinedIds={declinedIds}
            sessions={sessions}
            existingOptOuts={existingOptOuts}
            existingPartySizes={existingPartySizes}
          />
        )}
      </div>

      {/*
        On a phone the three-way toggle was ~190px of chrome at the top right of
        the first thing a friend sees, pushing the poll title onto two lines.
        It still belongs on this page — these links get opened in bed — just not
        ahead of the question being asked. Wide screens have room for it up top.
      */}
      <div className="mt-6 flex justify-center sm:hidden">
        <ThemeToggle />
      </div>
    </main>
  );
}
