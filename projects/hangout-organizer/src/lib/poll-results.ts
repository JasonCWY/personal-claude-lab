import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { buildHeatmapViews, type HeatmapView } from "@/lib/quorum";
import type { AvailabilityRow, PollResponse, SessionOptOut } from "@/lib/types";

export interface PollResultsPayload {
  heatmapViews: HeatmapView[];
  /** person_id -> how many slots they marked. Plain object: it crosses JSON. */
  slotsByPerson: Record<string, number>;
  responses: PollResponse[];
}

/**
 * The same friend-facing view of a poll's answers the host page shows, minus
 * the scoring-engine output (bookable windows stay host-only). Shared by the
 * availability submit route and the results route so a friend sees identical
 * numbers whether they just answered or are revisiting — both call this
 * instead of keeping two copies of the same four queries.
 */
export async function buildPollResultsPayload(
  supabase: ReturnType<typeof createServiceClient>,
  pollId: string,
): Promise<PollResultsPayload> {
  const [{ data: sessionData }, { data: availabilityData }, { data: responseData }, { data: peopleData }] =
    await Promise.all([
      supabase.from("sessions").select("id, title").eq("poll_id", pollId),
      supabase.from("availability").select("person_id, slot_start").eq("poll_id", pollId),
      supabase.from("poll_responses").select("*").eq("poll_id", pollId),
      supabase.from("poll_invitees").select("person_id").eq("poll_id", pollId),
    ]);

  const sessions = (sessionData ?? []) as { id: string; title: string }[];
  const availability = (availabilityData ?? []) as AvailabilityRow[];
  const responses = (responseData ?? []) as PollResponse[];
  const inviteeIds = (peopleData ?? []).map((r) => r.person_id as string);

  const [{ data: optOutData }, { data: nameData }] = await Promise.all([
    sessions.length
      ? supabase
          .from("session_optouts")
          .select("*")
          .in(
            "session_id",
            sessions.map((s) => s.id),
          )
      : Promise.resolve({ data: [] as SessionOptOut[] }),
    inviteeIds.length
      ? supabase.from("people").select("id, display_name").in("id", inviteeIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
  ]);

  const names = new Map(
    ((nameData ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]),
  );

  const optOutsBySession = new Map<string, Set<string>>();
  for (const row of (optOutData ?? []) as SessionOptOut[]) {
    const set = optOutsBySession.get(row.session_id) ?? new Set<string>();
    set.add(row.person_id);
    optOutsBySession.set(row.session_id, set);
  }

  const entries = availability.map((row) => ({
    personId: row.person_id,
    slotStart: new Date(row.slot_start),
  }));

  const slotsByPerson: Record<string, number> = {};
  for (const row of availability) {
    slotsByPerson[row.person_id] = (slotsByPerson[row.person_id] ?? 0) + 1;
  }

  return {
    heatmapViews: buildHeatmapViews(entries, sessions, optOutsBySession, names),
    slotsByPerson,
    responses,
  };
}
