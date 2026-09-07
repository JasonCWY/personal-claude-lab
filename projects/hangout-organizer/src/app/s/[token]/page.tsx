import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { PollForm } from "@/components/PollForm";
import { formatDuration, formatKl } from "@/lib/slots";
import type { AvailabilityRow, GameSession, Person, SessionResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * PUBLIC page — no login. Reads run on the service_role client, scoped by the
 * share token, because friends have no Supabase session and RLS grants `anon`
 * nothing. The token is the only credential, so nothing sensitive is exposed
 * here beyond roster first names and the poll itself.
 */
export default async function PublicPollPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("share_token", token)
    .maybeSingle<GameSession>();
  if (!session) notFound();

  const [{ data: peopleData }, { data: availabilityData }, { data: responseData }] =
    await Promise.all([
      supabase.from("people").select("*").eq("is_active", true).order("display_name"),
      supabase.from("availability").select("*").eq("session_id", session.id),
      supabase.from("session_responses").select("*").eq("session_id", session.id),
    ]);

  const roster = (peopleData ?? []) as Person[];
  const existing: Record<string, number[]> = {};
  for (const row of (availabilityData ?? []) as AvailabilityRow[]) {
    (existing[row.person_id] ??= []).push(new Date(row.slot_start).getTime());
  }

  const spec = {
    pollStartDate: session.poll_start_date,
    pollEndDate: session.poll_end_date,
    dayStartTime: session.day_start_time,
    dayEndTime: session.day_end_time,
    slotMinutes: session.slot_minutes,
  };

  const closed = session.status !== "polling";

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-semibold tracking-tight">{session.title}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {session.poll_start_date} to {session.poll_end_date} ·{" "}
        {session.day_start_time.slice(0, 5)}–{session.day_end_time.slice(0, 5)}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Need {session.min_players_full} people for{" "}
        {formatDuration(session.full_duration_minutes)}, or {session.min_players_short} for{" "}
        {formatDuration(session.short_duration_minutes)}. All times Malaysia time.
      </p>
      {session.notes && <p className="mt-3 text-sm text-slate-700">{session.notes}</p>}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {closed ? (
          <div>
            <h2 className="font-medium">This poll is closed.</h2>
            {session.status === "confirmed" && session.confirmed_start_at ? (
              <p className="mt-2 text-sm text-slate-700">
                Booked for {formatKl(new Date(session.confirmed_start_at))} ·{" "}
                {formatDuration(session.confirmed_duration_minutes ?? 0)}. See you there.
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                Status: {session.status}. Ask the host for details.
              </p>
            )}
          </div>
        ) : (
          <PollForm
            token={token}
            spec={spec}
            roster={roster}
            existing={existing}
            respondedIds={((responseData ?? []) as SessionResponse[]).map((r) => r.person_id)}
          />
        )}
      </div>
    </main>
  );
}
