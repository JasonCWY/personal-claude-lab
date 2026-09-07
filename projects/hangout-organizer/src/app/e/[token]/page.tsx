import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { PublicChecklist } from "@/components/PublicChecklist";
import type { EventTask, HangoutEvent, Person } from "@/lib/types";

export const dynamic = "force-dynamic";

/** PUBLIC page — no login. Ticking is allowed; editing the list is not. */
export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("share_token", token)
    .maybeSingle<HangoutEvent>();
  if (!event) notFound();

  const [{ data: taskData }, { data: peopleData }] = await Promise.all([
    supabase.from("event_tasks").select("*").eq("event_id", event.id).order("sort_order"),
    supabase.from("people").select("*").eq("is_active", true),
  ]);

  const tasks = (taskData ?? []) as EventTask[];
  const roster = (peopleData ?? []) as Person[];

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-semibold tracking-tight">{event.title}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {[event.event_date, event.location].filter(Boolean).join(" · ") || "Date to be confirmed"}
      </p>
      {event.notes && <p className="mt-3 text-sm text-slate-700">{event.notes}</p>}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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

      <p className="mt-4 text-xs text-slate-500">
        Ticking a task updates it for everyone. Ask the host to add or change tasks.
      </p>
    </main>
  );
}
