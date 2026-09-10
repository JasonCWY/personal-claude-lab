import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { PublicChecklist } from "@/components/PublicChecklist";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatDayHeader } from "@/lib/slots";
import type { EventTask, HangoutEvent, Person } from "@/lib/types";

export const dynamic = "force-dynamic";

/* One query shared by the unfurl and the page. See s/[token] for why. */
const getEvent = cache(async (token: string) => {
  const { data } = await createServiceClient()
    .from("events")
    .select("*")
    .eq("share_token", token)
    .maybeSingle<HangoutEvent>();
  return data;
});

/** What WhatsApp shows when the host pastes the checklist link. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const event = await getEvent(token);
  if (!event) return { title: "Event not found" };

  const title = event.title;
  const description =
    [event.event_date ? formatEventDate(event.event_date) : null, event.location]
      .filter(Boolean)
      .join(" · ") || "Date to be confirmed";

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

/** "2026-09-13" -> "Sun 13 Sep". A date friends read, not a database value. */
function formatEventDate(date: string): string {
  const { weekday, dayOfMonth, month } = formatDayHeader(date);
  return `${weekday} ${dayOfMonth} ${month}`;
}

/** PUBLIC page — no login. Ticking is allowed; editing the list is not. */
export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceClient();

  const event = await getEvent(token);
  if (!event) notFound();

  const [{ data: taskData }, { data: peopleData }] = await Promise.all([
    supabase.from("event_tasks").select("*").eq("event_id", event.id).order("sort_order"),
    supabase.from("people").select("*").eq("is_active", true),
  ]);

  const tasks = (taskData ?? []) as EventTask[];
  const roster = (peopleData ?? []) as Person[];

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-6">
      {/*
        The toggle is on the friend-facing pages too, not just the host's: these
        are the links opened from a group chat late at night, and they are the
        screens in this app most likely to be read in the dark.
      */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{event.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {[
              event.event_date ? formatEventDate(event.event_date) : null,
              event.location,
            ]
              .filter(Boolean)
              .join(" · ") || "Date to be confirmed"}
          </p>
        </div>
        <ThemeToggle className="hidden shrink-0 sm:flex" />
      </div>
      {event.notes && <p className="mt-3 text-sm text-ink-muted">{event.notes}</p>}

      <div className="mt-6 rounded-xl border border-line bg-surface p-4 shadow-sm">
        <PublicChecklist
          token={token}
          tasks={tasks.map((t) => ({
            id: t.id,
            title: t.title,
            notes: t.notes,
            dueDate: t.due_date,
            isDone: t.is_done,
            assignee:
              roster.find((p) => p.id === t.assignee_person_id)?.display_name ?? null,
          }))}
        />
      </div>

      <p className="mt-4 text-xs text-ink-soft">
        Ticking a task updates it for everyone. Ask the host to add or change tasks.
      </p>

      {/* Off the top of the first screen on a phone. See s/[token]. */}
      <div className="mt-6 flex justify-center sm:hidden">
        <ThemeToggle />
      </div>
    </main>
  );
}
