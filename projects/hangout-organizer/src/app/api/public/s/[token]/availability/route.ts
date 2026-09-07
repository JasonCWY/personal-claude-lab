import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildSlotGrid } from "@/lib/slots";
import type { GameSession } from "@/lib/types";

/**
 * Public availability submission.
 *
 * Uses the service_role key, so it must do its own authorisation. Three checks,
 * all necessary:
 *  1. The share token must resolve to a session that is still polling.
 *  2. The person must be on that roster and active — you cannot submit as a
 *     name the host never added.
 *  3. Every slot must be one the poll actually offers, so a crafted request
 *     cannot inject availability outside the polled window and skew the quorum.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: { personId?: string; slots?: string[]; comment?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const personId = body.personId;
  const slots = Array.isArray(body.slots) ? body.slots : [];
  if (!personId) {
    return NextResponse.json({ error: "personId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("share_token", token)
    .maybeSingle<GameSession>();
  if (!session) {
    return NextResponse.json({ error: "Unknown poll" }, { status: 404 });
  }
  if (session.status !== "polling") {
    return NextResponse.json({ error: "This poll is closed" }, { status: 409 });
  }

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("id", personId)
    .eq("is_active", true)
    .maybeSingle();
  if (!person) {
    return NextResponse.json({ error: "Not on this roster" }, { status: 403 });
  }

  const valid = new Set(
    buildSlotGrid({
      pollStartDate: session.poll_start_date,
      pollEndDate: session.poll_end_date,
      dayStartTime: session.day_start_time,
      dayEndTime: session.day_end_time,
      slotMinutes: session.slot_minutes,
    })
      .grid.flat()
      .map((d) => d.getTime()),
  );

  const accepted = [...new Set(slots.map((s) => new Date(s).getTime()))].filter(
    (ms) => Number.isFinite(ms) && valid.has(ms),
  );
  if (accepted.length !== new Set(slots).size) {
    return NextResponse.json({ error: "Some slots are not part of this poll" }, { status: 400 });
  }

  // Replace rather than merge: the grid submits the person's full answer, so a
  // cleared slot must actually disappear.
  await supabase
    .from("availability")
    .delete()
    .eq("session_id", session.id)
    .eq("person_id", personId);

  if (accepted.length) {
    const { error } = await supabase.from("availability").insert(
      accepted.map((ms) => ({
        session_id: session.id,
        person_id: personId,
        slot_start: new Date(ms).toISOString(),
      })),
    );
    if (error) {
      return NextResponse.json({ error: "Could not save availability" }, { status: 500 });
    }
  }

  await supabase.from("session_responses").upsert(
    {
      session_id: session.id,
      person_id: personId,
      submitted_at: new Date().toISOString(),
      comment: body.comment ?? null,
    },
    { onConflict: "session_id,person_id" },
  );

  return NextResponse.json({ ok: true, saved: accepted.length });
}
