import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildPollResultsPayload } from "@/lib/poll-results";
import type { Poll } from "@/lib/types";

/**
 * Friend-facing results: density heatmap + who's answered, never the
 * bookable-windows scoring output (that stays host-only).
 *
 * Gated on having answered, not merely on being invited — a friend who
 * hasn't submitted yet must not see the group's answers before giving their
 * own, or their answer stops being independent. `personId` itself is not a
 * secret (the roster is already in the poll page's HTML for the "who are
 * you" picker), so this defends against accidental exposure and outsiders,
 * not a friend who deliberately picks someone else's id — this app has no
 * per-friend accounts to do better than that with.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const personId = request.nextUrl.searchParams.get("personId");
  if (!personId) {
    return NextResponse.json({ error: "personId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: poll } = await supabase
    .from("polls")
    .select("*")
    .eq("share_token", token)
    .maybeSingle<Poll>();
  if (!poll) {
    return NextResponse.json({ error: "Unknown poll" }, { status: 404 });
  }

  const [{ data: invited }, { data: response }] = await Promise.all([
    supabase
      .from("poll_invitees")
      .select("person_id")
      .eq("poll_id", poll.id)
      .eq("person_id", personId)
      .maybeSingle(),
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
  if (!response) {
    return NextResponse.json({ error: "Answer the poll first" }, { status: 403 });
  }

  const results = await buildPollResultsPayload(supabase, poll.id);
  return NextResponse.json(results);
}
