import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildSlotGrid } from "@/lib/slots";
import type { Poll } from "@/lib/types";

const MAX_SLOTS = 2000;
const MAX_COMMENT = 500;

/**
 * Public availability submission.
 *
 * Uses the secret key, so it must do its own authorisation. Four checks, all
 * necessary:
 *  1. The share token must resolve to a poll that is still open.
 *  2. The person must be INVITED TO THIS POLL — not merely on the roster.
 *     A poll addressed to the badminton group must not accept an answer from
 *     someone who was never asked.
 *  3. That person must still be active.
 *  4. Every slot must be one the poll actually offers, so a crafted request
 *     cannot inject availability outside the window and skew the quorum.
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
  // Open to anyone holding the link, so bound the inputs before the database.
  if (slots.length > MAX_SLOTS) {
    return NextResponse.json({ error: "Too many slots" }, { status: 400 });
  }
  const comment =
    typeof body.comment === "string" ? body.comment.trim().slice(0, MAX_COMMENT) || null : null;

  const supabase = createServiceClient();

  const { data: poll } = await supabase
    .from("polls")
    .select("*")
    .eq("share_token", token)
    .maybeSingle<Poll>();
  if (!poll) {
    return NextResponse.json({ error: "Unknown poll" }, { status: 404 });
  }
  if (poll.status !== "polling") {
    return NextResponse.json({ error: "This poll is closed" }, { status: 409 });
  }

  const { data: invited } = await supabase
    .from("poll_invitees")
    .select("person_id")
    .eq("poll_id", poll.id)
    .eq("person_id", personId)
    .maybeSingle();
  if (!invited) {
    return NextResponse.json({ error: "You were not asked to this one" }, { status: 403 });
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
      pollStartDate: poll.poll_start_date,
      pollEndDate: poll.poll_end_date,
      dayStartTime: poll.day_start_time,
      dayEndTime: poll.day_end_time,
      slotMinutes: poll.slot_minutes,
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
  await supabase.from("availability").delete().eq("poll_id", poll.id).eq("person_id", personId);

  if (accepted.length) {
    const { error } = await supabase.from("availability").insert(
      accepted.map((ms) => ({
        poll_id: poll.id,
        person_id: personId,
        slot_start: new Date(ms).toISOString(),
      })),
    );
    if (error) {
      return NextResponse.json({ error: "Could not save availability" }, { status: 500 });
    }
  }

  await supabase.from("poll_responses").upsert(
    {
      poll_id: poll.id,
      person_id: personId,
      submitted_at: new Date().toISOString(),
      comment,
    },
    { onConflict: "poll_id,person_id" },
  );

  return NextResponse.json({ ok: true, saved: accepted.length });
}
