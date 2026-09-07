"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { newShareToken } from "@/lib/tokens";
import { shiftDate } from "@/lib/slots";

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}
function optStr(form: FormData, key: string): string | null {
  const v = str(form, key);
  return v === "" ? null : v;
}

/**
 * Create an event and, if a template was picked, materialise its checklist.
 *
 * Template items carry `days_before_offset`; combined with the event date that
 * becomes a real due date. No LLM is involved in v1 — these are static lists you
 * can edit per event or per template.
 */
export async function createEvent(form: FormData) {
  const supabase = await createClient();
  const eventDate = optStr(form, "event_date");

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      title: str(form, "title"),
      event_type: str(form, "event_type") || "other",
      event_date: eventDate,
      location: optStr(form, "location"),
      share_token: newShareToken(),
      notes: optStr(form, "notes"),
    })
    .select("id")
    .single();

  if (error || !event) return;

  const templateId = optStr(form, "template_id");
  if (templateId) {
    const { data: items } = await supabase
      .from("checklist_template_items")
      .select("*")
      .eq("template_id", templateId)
      .order("sort_order");

    if (items?.length) {
      await supabase.from("event_tasks").insert(
        items.map((item) => ({
          event_id: event.id,
          title: item.title,
          notes: item.notes,
          sort_order: item.sort_order,
          due_date:
            eventDate && item.days_before_offset != null
              ? shiftDate(eventDate, -item.days_before_offset)
              : null,
        })),
      );
    }
  }

  redirect(`/events/${event.id}`);
}

export async function updateEvent(form: FormData) {
  const id = str(form, "id");
  const supabase = await createClient();
  await supabase
    .from("events")
    .update({
      title: str(form, "title"),
      event_date: optStr(form, "event_date"),
      location: optStr(form, "location"),
      status: str(form, "status") || "planning",
      notes: optStr(form, "notes"),
    })
    .eq("id", id);
  revalidatePath(`/events/${id}`);
}

export async function deleteEvent(form: FormData) {
  const supabase = await createClient();
  await supabase.from("events").delete().eq("id", str(form, "id"));
  revalidatePath("/");
  redirect("/");
}

export async function addTask(form: FormData) {
  const eventId = str(form, "event_id");
  const title = str(form, "title");
  if (!title) return;

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("event_tasks")
    .select("sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("event_tasks").insert({
    event_id: eventId,
    title,
    assignee_person_id: optStr(form, "assignee_person_id"),
    due_date: optStr(form, "due_date"),
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  revalidatePath(`/events/${eventId}`);
}

export async function updateTask(form: FormData) {
  const eventId = str(form, "event_id");
  const supabase = await createClient();
  await supabase
    .from("event_tasks")
    .update({
      assignee_person_id: optStr(form, "assignee_person_id"),
      due_date: optStr(form, "due_date"),
    })
    .eq("id", str(form, "id"));
  revalidatePath(`/events/${eventId}`);
}

export async function toggleTask(form: FormData) {
  const eventId = str(form, "event_id");
  const isDone = str(form, "is_done") === "true";
  const supabase = await createClient();
  await supabase
    .from("event_tasks")
    .update({ is_done: isDone, done_at: isDone ? new Date().toISOString() : null })
    .eq("id", str(form, "id"));
  revalidatePath(`/events/${eventId}`);
}

export async function deleteTask(form: FormData) {
  const eventId = str(form, "event_id");
  const supabase = await createClient();
  await supabase.from("event_tasks").delete().eq("id", str(form, "id"));
  revalidatePath(`/events/${eventId}`);
}

// ------------------------------------------------------------- templates ----

export async function createTemplate(form: FormData) {
  const supabase = await createClient();
  const name = str(form, "name");
  if (!name) return;
  await supabase
    .from("checklist_templates")
    .insert({ name, event_type: str(form, "event_type") || "other" });
  revalidatePath("/templates");
}

export async function addTemplateItem(form: FormData) {
  const templateId = str(form, "template_id");
  const title = str(form, "title");
  if (!title) return;

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("checklist_template_items")
    .select("sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("checklist_template_items").insert({
    template_id: templateId,
    title,
    notes: optStr(form, "notes"),
    days_before_offset: optStr(form, "days_before_offset")
      ? Number(str(form, "days_before_offset"))
      : null,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  revalidatePath("/templates");
}

export async function deleteTemplateItem(form: FormData) {
  const supabase = await createClient();
  await supabase.from("checklist_template_items").delete().eq("id", str(form, "id"));
  revalidatePath("/templates");
}

export async function deleteTemplate(form: FormData) {
  const supabase = await createClient();
  // Built-ins are seeded by the migration; deleting them would need a re-run.
  await supabase
    .from("checklist_templates")
    .delete()
    .eq("id", str(form, "id"))
    .eq("is_builtin", false);
  revalidatePath("/templates");
}
