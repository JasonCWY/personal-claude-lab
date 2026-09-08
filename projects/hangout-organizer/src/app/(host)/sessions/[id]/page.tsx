import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteSession, duplicateSession, setSessionStatus } from "@/lib/actions";
import { Badge, Button, Card, Empty, ErrorBanner, PageHeader } from "@/components/ui";
import { CopyLink } from "@/components/CopyLink";
import { HeatmapGrid } from "@/components/HeatmapGrid";
import { QuorumSlots } from "@/components/QuorumSlots";
import { computeCandidates, computeSlotCounts, pendingResponders } from "@/lib/quorum";
import { formatDuration, formatKl } from "@/lib/slots";
import { SITE_URL } from "@/lib/env";
import type {
  AvailabilityRow,
  GameSession,
  Person,
  SessionResponse,
  Sport,
  Venue,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  polling: "amber",
  confirmed: "green",
  cancelled: "rose",
  completed: "slate",
} as const;

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const supabase = await createClient();

  const { data: sessionData } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle<GameSession>();
  if (!sessionData) notFound();
  const session = sessionData;

  const [
    { data: sportData },
    { data: peopleData },
    { data: availabilityData },
    { data: responseData },
    { data: venueData },
  ] = await Promise.all([
    supabase.from("sports").select("*").eq("id", session.sport_id).maybeSingle<Sport>(),
    supabase.from("people").select("*").order("display_name"),
    supabase.from("availability").select("*").eq("session_id", id),
    supabase.from("session_responses").select("*").eq("session_id", id),
    supabase.from("venues").select("*").eq("is_active", true).order("name"),
  ]);

  const roster = (peopleData ?? []) as Person[];
  const venues = (venueData ?? []) as Venue[];
  const responses = (responseData ?? []) as SessionResponse[];

  const availability = ((availabilityData ?? []) as AvailabilityRow[]).map((row) => ({
    personId: row.person_id,
    slotStart: new Date(row.slot_start),
  }));

  const rules = {
    minPlayersFull: session.min_players_full,
    fullDurationMinutes: session.full_duration_minutes,
    minPlayersShort: session.min_players_short,
    shortDurationMinutes: session.short_duration_minutes,
  };

  const candidates = computeCandidates(availability, rules, session.slot_minutes);
  const slotCounts = computeSlotCounts(availability);
  const activeRoster = roster.filter((p) => p.is_active);
  const waitingOn = pendingResponders(
    activeRoster,
    responses.map((r) => r.person_id),
  );

  const shareUrl = `${SITE_URL()}/s/${session.share_token}`;
  const venue = venues.find((v) => v.id === session.venue_id);
  const whatsappMessage =
    `${session.title} — when are you free?\n` +
    `${session.poll_start_date} to ${session.poll_end_date}, ` +
    `${session.day_start_time.slice(0, 5)}-${session.day_end_time.slice(0, 5)}.\n` +
    `Need ${session.min_players_full} for ${formatDuration(session.full_duration_minutes)}, ` +
    `or ${session.min_players_short} for ${formatDuration(session.short_duration_minutes)}.\n` +
    `Tap your name and drag the times you can make:`;

  return (
    <>
      <PageHeader
        title={session.title}
        subtitle={`${sportData?.name ?? "Session"} · polling ${session.poll_start_date} to ${session.poll_end_date}`}
        action={<Badge tone={STATUS_TONE[session.status]}>{session.status}</Badge>}
      />

      <ErrorBanner message={actionError} />

      {session.status === "confirmed" && session.confirmed_start_at && (
        <Card className="mb-6 border-emerald-300 bg-emerald-50">
          <h2 className="font-medium text-emerald-900">
            Booked: {formatKl(new Date(session.confirmed_start_at))} ·{" "}
            {formatDuration(session.confirmed_duration_minutes ?? 0)}
          </h2>
          {venue && (
            <p className="mt-1 text-sm text-emerald-900">
              {venue.name}
              {venue.platform_name ? ` · book on ${venue.platform_name}` : ""}
              {venue.price_per_hour != null
                ? ` · RM ${Number(venue.price_per_hour).toFixed(2)}/hr`
                : ""}
            </p>
          )}
          {venue?.booking_url && (
            <a
              href={venue.booking_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Open booking page
            </a>
          )}
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="mb-2 font-medium">Share with the group</h2>
        <CopyLink url={shareUrl} message={whatsappMessage} />
      </Card>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Bookable windows
        </h2>
        <QuorumSlots
          sessionId={session.id}
          candidates={candidates}
          roster={roster}
          venues={venues}
          defaultVenueId={session.venue_id}
          minPlayersFull={session.min_players_full}
          minPlayersShort={session.min_players_short}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Who is free when
        </h2>
        <Card>
          {availability.length === 0 ? (
            <Empty>No answers yet. Share the link above.</Empty>
          ) : (
            <HeatmapGrid
              spec={{
                pollStartDate: session.poll_start_date,
                pollEndDate: session.poll_end_date,
                dayStartTime: session.day_start_time,
                dayEndTime: session.day_end_time,
                slotMinutes: session.slot_minutes,
              }}
              slotCounts={slotCounts}
              roster={roster}
            />
          )}
        </Card>
      </section>

      <section className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <h3 className="mb-2 font-medium">Answered ({responses.length})</h3>
          {responses.length === 0 ? (
            <p className="text-sm text-slate-500">Nobody yet.</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-700">
              {responses.map((r) => {
                const person = roster.find((p) => p.id === r.person_id);
                return (
                  <li key={r.person_id}>
                    {person?.display_name ?? "Unknown"}
                    {r.comment && <span className="text-slate-500"> — {r.comment}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="mb-2 font-medium">Still waiting on ({waitingOn.length})</h3>
          {waitingOn.length === 0 ? (
            <p className="text-sm text-slate-500">Everyone has answered.</p>
          ) : (
            <p className="text-sm text-slate-700">
              {waitingOn.map((p) => p.display_name).join(", ")}
            </p>
          )}
        </Card>
      </section>

      <Card>
        <h3 className="mb-3 font-medium">Session actions</h3>
        <div className="flex flex-wrap gap-2">
          <form action={duplicateSession}>
            <input type="hidden" name="id" value={session.id} />
            <input type="hidden" name="shift_days" value="7" />
            <Button type="submit" variant="secondary">
              Duplicate for next week
            </Button>
          </form>
          {session.status !== "polling" && (
            <form action={setSessionStatus}>
              <input type="hidden" name="id" value={session.id} />
              <input type="hidden" name="status" value="polling" />
              <Button type="submit" variant="secondary">
                Reopen poll
              </Button>
            </form>
          )}
          {session.status === "confirmed" && (
            <form action={setSessionStatus}>
              <input type="hidden" name="id" value={session.id} />
              <input type="hidden" name="status" value="completed" />
              <Button type="submit" variant="secondary">
                Mark completed
              </Button>
            </form>
          )}
          <form action={setSessionStatus}>
            <input type="hidden" name="id" value={session.id} />
            <input type="hidden" name="status" value="cancelled" />
            <Button type="submit" variant="secondary">
              Cancel
            </Button>
          </form>
          <form action={deleteSession}>
            <input type="hidden" name="id" value={session.id} />
            <Button type="submit" variant="danger">
              Delete
            </Button>
          </form>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Duplicating creates a fresh poll one week later with a new share link — the old link keeps
          pointing at the old session.
        </p>
      </Card>
    </>
  );
}
