import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { PollForm } from "@/components/PollForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  formatDateRange,
  formatDateSpan,
  formatDays,
  formatDuration,
  formatSpan,
} from "@/lib/slots";
import type {
  AvailabilityRow,
  GameSession,
  Person,
  Poll,
  PollResponse,
  SessionOptOut,
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

  const when =
    poll.granularity === "date"
      ? formatDateRange(poll.poll_start_date, poll.poll_end_date)
      : `${formatDateRange(poll.poll_start_date, poll.poll_end_date)}, ${poll.day_start_time.slice(
          0,
          5,
        )}–${poll.day_end_time.slice(0, 5)}`;

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
    supabase.from("poll_responses").select("person_id, declined").eq("poll_id", poll.id),
    supabase.from("sessions").select("*").eq("poll_id", poll.id).order("created_at"),
  ]);

  const inviteeIds = (inviteeData ?? []).map((r) => r.person_id as string);
  const sessions = (sessionData ?? []) as GameSession[];

  // The roster and the opt-outs each need an ID list from the wave above, but
  // not from each other — so they go out together rather than one after the
  // other. This is the friend-facing page, opened from a phone on mobile data,
  // where every avoidable round trip is felt.
  const [{ data: peopleData }, { data: optOutData }] = await Promise.all([
    inviteeIds.length
      ? supabase
          .from("people")
          .select("*")
          .in("id", inviteeIds)
          .eq("is_active", true)
          .order("display_name")
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
  ]);

  const roster = (peopleData ?? []) as Person[];

  const existing: Record<string, number[]> = {};
  for (const row of (availabilityData ?? []) as AvailabilityRow[]) {
    (existing[row.person_id] ??= []).push(new Date(row.slot_start).getTime());
  }

  // Who has already said none of the dates work, so returning to the link shows
  // that back rather than a blank grid that looks like they never answered.
  const responses = (responseData ?? []) as PollResponse[];
  const declinedIds = responses.filter((r) => r.declined).map((r) => r.person_id);

  const existingOptOuts: Record<string, string[]> = {};
  for (const row of (optOutData ?? []) as SessionOptOut[]) {
    (existingOptOuts[row.person_id] ??= []).push(row.session_id);
  }

  const byDate = poll.granularity === 'date';

  const spec = {
    pollStartDate: poll.poll_start_date,
    pollEndDate: poll.poll_end_date,
    granularity: poll.granularity,
    dayStartTime: poll.day_start_time,
    dayEndTime: poll.day_end_time,
    slotMinutes: poll.slot_minutes,
  };

  const closed = poll.status !== "polling";
  const booked = sessions.filter((s) => s.status === "confirmed" && s.confirmed_start_at);

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
            {formatDateRange(poll.poll_start_date, poll.poll_end_date)}
            {byDate ? "" : ` · ${poll.day_start_time.slice(0, 5)}–${poll.day_end_time.slice(0, 5)}`}
          </p>
        </div>
        <ThemeToggle className="hidden shrink-0 sm:flex" />
      </div>

      {sessions.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-ink-soft">
          {sessions.map((s) => (
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

      {poll.notes && <p className="mt-3 text-sm text-ink-muted">{poll.notes}</p>}

      <div className="mt-6 rounded-xl border border-line bg-surface p-4 shadow-sm">
        {closed ? (
          <div>
            <h2 className="font-medium">This poll is closed.</h2>
            {booked.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                {booked.map((s) => (
                  <li key={s.id}>
                    <strong>{s.title}</strong> —{" "}
                    {byDate
                      ? formatDateSpan(
                          new Date(s.confirmed_start_at!),
                          s.confirmed_duration_minutes ?? 0,
                        )
                      : formatSpan(
                          new Date(s.confirmed_start_at!),
                          s.confirmed_duration_minutes ?? 0,
                        )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">Ask the host for details.</p>
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
