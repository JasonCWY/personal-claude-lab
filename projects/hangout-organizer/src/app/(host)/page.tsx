import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { formatDuration, formatSpan } from "@/lib/slots";
import type { EventTask, GameSession, HangoutEvent, Poll, Sport } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();

  const [{ data: pollData }, { data: sessions }, { data: sports }, { data: events }, { data: tasks }] =
    await Promise.all([
      supabase
        .from("polls")
        .select("*")
        .order("poll_start_date", { ascending: false })
        .limit(20),
      supabase.from("sessions").select("*"),
      supabase.from("sports").select("*"),
      supabase.from("events").select("*").order("event_date", { ascending: true }).limit(20),
      supabase.from("event_tasks").select("*").eq("is_done", false),
    ]);

  const sportName = new Map((sports ?? []).map((s: Sport) => [s.id, s.name]));
  const polls = (pollData ?? []) as Poll[];
  const sessionsByPoll = new Map<string, GameSession[]>();
  for (const session of (sessions ?? []) as GameSession[]) {
    sessionsByPoll.set(session.poll_id, [...(sessionsByPoll.get(session.poll_id) ?? []), session]);
  }
  const openTasks = new Map<string, number>();
  for (const task of (tasks ?? []) as EventTask[]) {
    openTasks.set(task.event_id, (openTasks.get(task.event_id) ?? 0) + 1);
  }

  const polling = polls.filter((p) => p.status === "polling");
  const upcoming = ((sessions ?? []) as GameSession[])
    .filter((s) => s.status === "confirmed" && s.confirmed_start_at)
    .sort((a, b) => (a.confirmed_start_at ?? "").localeCompare(b.confirmed_start_at ?? ""));
  const pollById = new Map(polls.map((p) => [p.id, p]));
  const liveEvents = ((events ?? []) as HangoutEvent[]).filter(
    (e) => e.status === "planning" || e.status === "confirmed",
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Everything currently in flight."
        action={
          <div className="flex gap-2">
            <LinkButton href="/polls/new">New poll</LinkButton>
            <LinkButton href="/events/new">New event</LinkButton>
          </div>
        }
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Polls open
        </h2>
        {polling.length === 0 ? (
          <Empty>No polls running. Start one to collect availability.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {polling.map((poll) => {
              const activities = sessionsByPoll.get(poll.id) ?? [];
              return (
                <Link key={poll.id} href={`/polls/${poll.id}`}>
                  <Card className="transition hover:border-slate-400">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{poll.title}</span>
                      <Badge tone="amber">polling</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {poll.poll_start_date} to {poll.poll_end_date} ·{" "}
                      {poll.day_start_time.slice(0, 5)}–{poll.day_end_time.slice(0, 5)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {activities.length === 0
                        ? "No activities yet"
                        : activities.map((a) => a.title).join(", ")}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Confirmed sessions
        </h2>
        {upcoming.length === 0 ? (
          <Empty>Nothing booked yet.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((s) => (
              <Link key={s.id} href={`/polls/${s.poll_id}`}>
                <Card className="transition hover:border-slate-400">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{s.title}</span>
                    <Badge tone="green">confirmed</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatSpan(
                      new Date(s.confirmed_start_at!),
                      s.confirmed_duration_minutes ?? 0,
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {s.sport_id ? sportName.get(s.sport_id) : "Trip"}
                    {pollById.get(s.poll_id) ? ` · ${pollById.get(s.poll_id)!.title}` : ""}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Events
        </h2>
        {liveEvents.length === 0 ? (
          <Empty>No events being planned.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {liveEvents.map((e) => (
              <Link key={e.id} href={`/events/${e.id}`}>
                <Card className="transition hover:border-slate-400">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{e.title}</span>
                    <Badge>{e.event_type}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {e.event_date ?? "No date yet"}
                    {e.location ? ` · ${e.location}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {openTasks.get(e.id) ?? 0} task{(openTasks.get(e.id) ?? 0) === 1 ? "" : "s"} left
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
