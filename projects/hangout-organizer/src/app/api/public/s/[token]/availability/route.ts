import { after, NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendHostPush } from "@/lib/push";
import { describeResponse } from "@/lib/push-message";
import { pollClosedReason } from "@/lib/poll-state";
import { buildSlotGrid } from "@/lib/slots";
import type { Poll } from "@/lib/types";

const MAX_SLOTS = 2000;
const MAX_COMMENT = 500;
/** Matches the check constraint in migration 010. */
const MAX_PARTY = 20;

/**
 * Public availability submission.
 *
 * Uses the secret key, so it must do its own authorisation. Four checks, all
 * necessary:
 *  1. The share token must resolve to a poll that is still open — which now
 *     means the host has not closed it AND its cut-off has not passed.
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

  let body: {
    personId?: string;
    slots?: string[];
    comment?: string | null;
    /** Activities in this poll the person is NOT up for. Absence means in. */
    optOutSessionIds?: string[];
    /** "None of these work for me." Answers the poll with no availability. */
    declined?: boolean;
    /** How many are coming, including the person answering. Default 1. */
    partySize?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const personId = body.personId;
  const declined = body.declined === true;
  // A decline is an answer of "no times", so any slots in the body are ignored
  // rather than rejected — the two cannot both be true, and the client having
  // sent stale grid state is not worth failing a submission over.
  const slots = declined ? [] : Array.isArray(body.slots) ? body.slots : [];
  if (!personId) {
    return NextResponse.json({ error: "personId is required" }, { status: 400 });
  }
  // Open to anyone holding the link, so bound the inputs before the database.
  if (slots.length > MAX_SLOTS) {
    return NextResponse.json({ error: "Too many slots" }, { status: 400 });
  }
  const comment =
    typeof body.comment === "string" ? body.comment.trim().slice(0, MAX_COMMENT) || null : null;

  // Clamped rather than rejected. This decides how long a court is booked for
  // and it arrives from an endpoint anyone with the link can post to, so it
  // must be bounded — but a stepper that somehow sent 0 or 100 is a client bug,
  // and failing a friend's whole submission over it helps nobody. A decline
  // brings nobody, whatever the grid happened to have selected.
  const partySize = declined
    ? 1
    : Math.min(MAX_PARTY, Math.max(1, Math.floor(Number(body.partySize) || 1)));

  const supabase = createServiceClient();

  const { data: poll } = await supabase
    .from("polls")
    .select("*")
    .eq("share_token", token)
    .maybeSingle<Poll>();
  if (!poll) {
    return NextResponse.json({ error: "Unknown poll" }, { status: 404 });
  }
  // The cut-off is enforced here, not by a scheduled job. A deadline that only
  // greys out the button on the page is not a deadline: the endpoint is public,
  // and a late answer silently changes the headcount under a booking that has
  // already been made.
  const closed = pollClosedReason(poll);
  if (closed) {
    return NextResponse.json(
      {
        error:
          closed === "cut-off"
            ? "This poll has closed — the deadline has passed."
            : "This poll is closed",
      },
      { status: 409 },
    );
  }

  // Checks 2 and 3 are independent of each other, and the session list is
  // needed either way, so all three go out together. Submitting used to be nine
  // sequential round trips to Supabase; the button sat on "Saving…" for the sum
  // of them.
  // The name and the prior response row are only for the notification, and they
  // ride along here rather than costing their own round trips. `prior` is also
  // the only chance to tell a new answer from a correction: the upsert below
  // destroys that distinction.
  const [{ data: invited }, { data: person }, { data: pollSessions }, { data: prior }] =
    await Promise.all([
      supabase
        .from("poll_invitees")
        .select("person_id")
        .eq("poll_id", poll.id)
        .eq("person_id", personId)
        .maybeSingle(),
      supabase
        .from("people")
        .select("id, display_name")
        .eq("id", personId)
        .eq("is_active", true)
        .maybeSingle<{ id: string; display_name: string }>(),
      supabase.from("sessions").select("id").eq("poll_id", poll.id),
      supabase
        .from("poll_responses")
        .select("person_id")
        .eq("poll_id", poll.id)
        .eq("person_id", personId)
        .maybeSingle(),
    ]);
  if (!invited) {
    return NextResponse.json({ error: "You were not asked to this one" }, { status: 403 });
  }
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

  // "Which of these are you up for?" — recorded as opt-OUTS so that an activity
  // added to a running poll counts everyone by default and nobody has to answer
  // again. Only sessions belonging to THIS poll are touched, so a crafted body
  // cannot opt someone out of an activity in someone else's poll.
  const sessionIds = new Set((pollSessions ?? []).map((r) => r.id as string));
  const optOuts = Array.isArray(body.optOutSessionIds)
    ? [...new Set(body.optOutSessionIds.map(String))].filter((id) => sessionIds.has(id))
    : [];

  // Both deletes are "replace rather than merge": the grid submits the person's
  // complete answer, so a cleared slot and an un-ticked activity must actually
  // disappear. They touch different tables and different rows, so they can go
  // together — but they must both land before the inserts.
  await Promise.all([
    supabase.from("availability").delete().eq("poll_id", poll.id).eq("person_id", personId),
    sessionIds.size
      ? supabase
          .from("session_optouts")
          .delete()
          .eq("person_id", personId)
          .in("session_id", [...sessionIds])
      : Promise.resolve({ error: null }),
  ]);

  const [availabilityWrite, optOutWrite] = await Promise.all([
    accepted.length
      ? supabase.from("availability").insert(
          accepted.map((ms) => ({
            poll_id: poll.id,
            person_id: personId,
            slot_start: new Date(ms).toISOString(),
          })),
        )
      : Promise.resolve({ error: null }),
    optOuts.length
      ? supabase
          .from("session_optouts")
          .insert(optOuts.map((session_id) => ({ session_id, person_id: personId })))
      : Promise.resolve({ error: null }),
  ]);

  if (availabilityWrite.error) {
    return NextResponse.json({ error: "Could not save availability" }, { status: 500 });
  }
  if (optOutWrite.error) {
    return NextResponse.json({ error: "Could not save your activity choices" }, { status: 500 });
  }

  // Deliberately last, and deliberately not batched with the writes above. This
  // row is what makes the host page count someone as having answered, so it
  // must not exist unless their answer actually landed. That ordering matters
  // more now that declines exist: a response row written over a failed
  // availability insert would be indistinguishable from someone deliberately
  // saying none of the dates work, and the host would stop chasing them.
  await supabase.from("poll_responses").upsert(
    {
      poll_id: poll.id,
      person_id: personId,
      submitted_at: new Date().toISOString(),
      comment,
      declined,
      party_size: partySize,
    },
    { onConflict: "poll_id,person_id" },
  );

  /*
   * Tell the host — after the friend already has their answer back.
   *
   * `after()` is what keeps this free at the point of use: the counts below and
   * the fan-out to the host's devices run once the response is on the wire, so
   * the Saving… button is no slower than before notifications existed, which was
   * the whole point of the round-trip work in e857d58.
   *
   * Everything in here is best-effort and swallows its own errors. A failure to
   * notify is not a failure to record an answer, and the friend must never be
   * told otherwise.
   */
  after(async () => {
    try {
      const [{ count: answered }, { count: invitedCount }] = await Promise.all([
        supabase
          .from("poll_responses")
          .select("*", { count: "exact", head: true })
          .eq("poll_id", poll.id),
        supabase
          .from("poll_invitees")
          .select("*", { count: "exact", head: true })
          .eq("poll_id", poll.id),
      ]);
      await sendHostPush(
        describeResponse({
          personName: person.display_name,
          pollTitle: poll.title,
          pollId: poll.id,
          declined,
          isFirstAnswer: !prior,
          answered: answered ?? 0,
          invited: invitedCount ?? 0,
        }),
      );
    } catch (error) {
      console.error("[push] notifying the host failed:", (error as Error).message);
    }
  });

  return NextResponse.json({ ok: true, saved: accepted.length });
}
