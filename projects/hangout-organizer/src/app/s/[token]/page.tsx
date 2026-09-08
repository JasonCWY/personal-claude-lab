import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { PollForm } from "@/components/PollForm";
import { formatDateSpan, formatDays, formatDuration, formatSpan } from "@/lib/slots";
import type {
  AvailabilityRow,
  GameSession,
  Person,
  Poll,
  PollResponse,
} from "@/lib/types";

export const dynamic = "force-dynamic";

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

  const { data: poll } = await supabase
    .from("polls")
    .select("*")
    .eq("share_token", token)
    .maybeSingle<Poll>();
  if (!poll) notFound();

  const [
    { data: inviteeData },
    { data: availabilityData },
    { data: responseData },
    { data: sessionData },
  ] = await Promise.all([
    supabase.from("poll_invitees").select("person_id").eq("poll_id", poll.id),
    supabase.from("availability").select("*").eq("poll_id", poll.id),
    supabase.from("poll_responses").select("*").eq("poll_id", poll.id),
    supabase.from("sessions").select("*").eq("poll_id", poll.id).order("created_at"),
  ]);

  const inviteeIds = (inviteeData ?? []).map((r) => r.person_id as string);
  const { data: peopleData } = inviteeIds.length
    ? await supabase
        .from("people")
        .select("*")
        .in("id", inviteeIds)
        .eq("is_active", true)
        .order("display_name")
    : { data: [] as Person[] };

  const roster = (peopleData ?? []) as Person[];
  const sessions = (sessionData ?? []) as GameSession[];

  const existing: Record<string, number[]> = {};
  for (const row of (availabilityData ?? []) as AvailabilityRow[]) {
    (existing[row.person_id] ??= []).push(new Date(row.slot_start).getTime());
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
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-semibold tracking-tight">{poll.title}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {poll.poll_start_date} to {poll.poll_end_date}
        {byDate ? "" : ` · ${poll.day_start_time.slice(0, 5)}–${poll.day_end_time.slice(0, 5)}`}
      </p>

      {sessions.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-slate-500">
          {sessions.map((s) => (
            <li key={s.id}>
              <span className="font-medium text-slate-700">{s.title}</span> — need{" "}
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
      <p className="mt-2 text-xs text-slate-500">
        Answer once — it counts for everything listed above. All times Malaysia time.
      </p>

      {poll.notes && <p className="mt-3 text-sm text-slate-700">{poll.notes}</p>}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {closed ? (
          <div>
            <h2 className="font-medium">This poll is closed.</h2>
            {booked.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
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
              <p className="mt-2 text-sm text-slate-600">Ask the host for details.</p>
            )}
          </div>
        ) : (
          <PollForm
            token={token}
            spec={spec}
            roster={roster}
            existing={existing}
            respondedIds={((responseData ?? []) as PollResponse[]).map((r) => r.person_id)}
          />
        )}
      </div>
    </main>
  );
}
