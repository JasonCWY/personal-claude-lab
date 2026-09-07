import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addTask,
  deleteEvent,
  deleteTask,
  toggleTask,
  updateEvent,
  updateTask,
} from "@/lib/event-actions";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { CopyLink } from "@/components/CopyLink";
import { SITE_URL } from "@/lib/env";
import type { EventTask, HangoutEvent, Person } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle<HangoutEvent>();
  if (!event) notFound();

  const [{ data: taskData }, { data: peopleData }] = await Promise.all([
    supabase.from("event_tasks").select("*").eq("event_id", id).order("sort_order"),
    supabase.from("people").select("*").eq("is_active", true).order("display_name"),
  ]);

  const tasks = (taskData ?? []) as EventTask[];
  const roster = (peopleData ?? []) as Person[];
  const done = tasks.filter((t) => t.is_done).length;
  const shareUrl = `${SITE_URL()}/e/${event.share_token}`;

  return (
    <>
      <PageHeader
        title={event.title}
        subtitle={[event.event_date, event.location].filter(Boolean).join(" · ") || "No date set"}
        action={<Badge>{event.status}</Badge>}
      />

      <Card className="mb-6">
        <h2 className="mb-2 font-medium">Share the checklist</h2>
        <CopyLink
          url={shareUrl}
          message={`${event.title} — here is the checklist. Tick off anything you have done:`}
        />
        <p className="mt-2 text-xs text-slate-500">
          Anyone with this link can tick tasks off. They cannot add, edit or delete them.
        </p>
      </Card>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Checklist
          </h2>
          <span className="text-sm text-slate-500">
            {done} / {tasks.length} done
          </span>
        </div>

        {tasks.length === 0 ? (
          <Empty>No tasks yet. Add one below, or start from a template next time.</Empty>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <Card key={task.id} className="flex flex-wrap items-center gap-3">
                <form action={toggleTask} className="flex items-center">
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="event_id" value={event.id} />
                  <input type="hidden" name="is_done" value={String(!task.is_done)} />
                  <button
                    type="submit"
                    aria-label={task.is_done ? "Mark not done" : "Mark done"}
                    className={`h-5 w-5 rounded border ${
                      task.is_done
                        ? "border-emerald-600 bg-emerald-600"
                        : "border-slate-400 bg-white"
                    }`}
                  />
                </form>

                <div className="min-w-[10rem] flex-1">
                  <p className={task.is_done ? "text-slate-400 line-through" : "font-medium"}>
                    {task.title}
                  </p>
                  {task.notes && <p className="text-xs text-slate-500">{task.notes}</p>}
                </div>

                <form action={updateTask} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="event_id" value={event.id} />
                  <select
                    name="assignee_person_id"
                    defaultValue={task.assignee_person_id ?? ""}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {roster.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    name="due_date"
                    defaultValue={task.due_date ?? ""}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  />
                  <Button type="submit" variant="secondary">
                    Save
                  </Button>
                </form>

                <form action={deleteTask}>
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="event_id" value={event.id} />
                  <Button type="submit" variant="danger">
                    Delete
                  </Button>
                </form>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Card className="mb-6">
        <h3 className="mb-3 font-medium">Add a task</h3>
        <form action={addTask} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="event_id" value={event.id} />
          <div className="min-w-[14rem] flex-1">
            <Field label="Task">
              <Input name="title" required />
            </Field>
          </div>
          <Field label="Assign to">
            <Select name="assignee_person_id" defaultValue="">
              <option value="">Unassigned</option>
              {roster.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due">
            <Input type="date" name="due_date" />
          </Field>
          <Button type="submit">Add</Button>
        </form>
      </Card>

      <Card>
        <h3 className="mb-3 font-medium">Event details</h3>
        <form action={updateEvent} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={event.id} />
          <Field label="Title">
            <Input name="title" defaultValue={event.title} required />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={event.status}>
              <option value="planning">Planning</option>
              <option value="confirmed">Confirmed</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" name="event_date" defaultValue={event.event_date ?? ""} />
          </Field>
          <Field label="Location">
            <Input name="location" defaultValue={event.location ?? ""} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea name="notes" defaultValue={event.notes ?? ""} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Save details</Button>
          </div>
        </form>
        <form action={deleteEvent} className="mt-3">
          <input type="hidden" name="id" value={event.id} />
          <Button type="submit" variant="danger">
            Delete event
          </Button>
        </form>
      </Card>
    </>
  );
}
