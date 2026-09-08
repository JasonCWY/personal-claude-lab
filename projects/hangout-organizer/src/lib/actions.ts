"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { newShareToken } from "@/lib/tokens";
import { shiftDate } from "@/lib/slots";
import type { GameSession } from "@/lib/types";

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function optStr(form: FormData, key: string): string | null {
  const v = str(form, key);
  return v === "" ? null : v;
}

function optNum(form: FormData, key: string): number | null {
  const v = str(form, key);
  return v === "" ? null : Number(v);
}

// ---------------------------------------------------------------- roster ----

export async function addPerson(form: FormData) {
  const displayName = str(form, "display_name");
  if (!displayName) return;

  const supabase = await createClient();
  await supabase.from("people").insert({ display_name: displayName });
  revalidatePath("/people");
}

export async function togglePersonActive(form: FormData) {
  const supabase = await createClient();
  await supabase
    .from("people")
    .update({ is_active: str(form, "is_active") === "true" })
    .eq("id", str(form, "id"));
  revalidatePath("/people");
}

export async function deletePerson(form: FormData) {
  const supabase = await createClient();
  await supabase.from("people").delete().eq("id", str(form, "id"));
  revalidatePath("/people");
}

// ---------------------------------------------------------------- venues ----

export async function saveVenue(form: FormData) {
  const supabase = await createClient();
  const id = optStr(form, "id");
  const payload = {
    name: str(form, "name"),
    sport_id: optStr(form, "sport_id"),
    platform_name: optStr(form, "platform_name"),
    booking_url: optStr(form, "booking_url"),
    price_per_hour: optNum(form, "price_per_hour"),
    peak_price_per_hour: optNum(form, "peak_price_per_hour"),
    booking_opens_days_ahead: optNum(form, "booking_opens_days_ahead"),
    address: optStr(form, "address"),
    notes: optStr(form, "notes"),
  };
  if (!payload.name) return;

  if (id) await supabase.from("venues").update(payload).eq("id", id);
  else await supabase.from("venues").insert(payload);

  revalidatePath("/venues");
}

export async function deleteVenue(form: FormData) {
  const supabase = await createClient();
  await supabase.from("venues").delete().eq("id", str(form, "id"));
  revalidatePath("/venues");
}

// -------------------------------------------------------------- sessions ----

/**
 * Validate what the DB's CHECK constraints enforce, so the host gets a sentence
 * instead of a form that silently does nothing. Returns null when the input is
 * fine. Keep these in step with the `sessions_*` constraints in the migration.
 */
function validateSessionForm(form: FormData): string | null {
  const startDate = str(form, "poll_start_date");
  const endDate = str(form, "poll_end_date");
  if (endDate < startDate) {
    return "The 'poll until' date is before the 'poll from' date.";
  }

  // An end at or before the start means the next day (22:00-00:00 is a normal
  // evening session), so only equality is rejected — that would be 24 hours.
  const startTime = str(form, "day_start_time");
  const endTime = str(form, "day_end_time");
  if (endTime === startTime) {
    return "The earliest start and latest end are the same time.";
  }

  const slot = Number(str(form, "slot_minutes") || 30);
  if (slot !== 30 && slot !== 60) {
    return "Slot size must be 30 or 60 minutes.";
  }

  return null;
}

export async function createSession(form: FormData) {
  const problem = validateSessionForm(form);
  if (problem) {
    redirect(`/sessions/new?error=${encodeURIComponent(problem)}`);
  }

  const supabase = await createClient();
  const sportId = str(form, "sport_id");

  const { data: sport } = await supabase
    .from("sports")
    .select("*")
    .eq("id", sportId)
    .single();
  if (!sport) {
    redirect(`/sessions/new?error=${encodeURIComponent("That sport no longer exists.")}`);
  }

  // Sport thresholds are DEFAULTS. They are copied onto the session so that
  // editing the sport later never rewrites the rules of a poll already running.
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      sport_id: sportId,
      title: str(form, "title") || `${sport.name} session`,
      share_token: newShareToken(),
      poll_start_date: str(form, "poll_start_date"),
      poll_end_date: str(form, "poll_end_date"),
      day_start_time: str(form, "day_start_time"),
      day_end_time: str(form, "day_end_time"),
      slot_minutes: Number(str(form, "slot_minutes") || 30),
      min_players_full: Number(str(form, "min_players_full") || sport.min_players_full),
      full_duration_minutes: Number(
        str(form, "full_duration_minutes") || sport.full_duration_minutes,
      ),
      min_players_short: Number(str(form, "min_players_short") || sport.min_players_short),
      short_duration_minutes: Number(
        str(form, "short_duration_minutes") || sport.short_duration_minutes,
      ),
      venue_id: optStr(form, "venue_id"),
      notes: optStr(form, "notes"),
    })
    .select("id")
    .single();

  if (error || !data) {
    // Anything the validation above did not anticipate. Show it rather than
    // returning silently, which renders as a button that does nothing.
    const message = error?.message ?? "Could not create the session.";
    redirect(`/sessions/new?error=${encodeURIComponent(message)}`);
  }
  redirect(`/sessions/${data.id}`);
}

export async function confirmSession(form: FormData) {
  const id = str(form, "id");
  const supabase = await createClient();

  await supabase
    .from("sessions")
    .update({
      status: "confirmed",
      confirmed_start_at: str(form, "confirmed_start_at"),
      confirmed_duration_minutes: Number(str(form, "confirmed_duration_minutes")),
      venue_id: optStr(form, "venue_id"),
    })
    .eq("id", id);

  // Snapshot who was free for the chosen window as the initial headcount.
  const personIds = String(form.get("people") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (personIds.length) {
    await supabase.from("attendees").delete().eq("session_id", id);
    await supabase
      .from("attendees")
      .insert(personIds.map((pid) => ({ session_id: id, person_id: pid, status: "in" })));
  }

  revalidatePath(`/sessions/${id}`);
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function setSessionStatus(form: FormData) {
  const id = str(form, "id");
  const supabase = await createClient();
  await supabase.from("sessions").update({ status: str(form, "status") }).eq("id", id);
  revalidatePath(`/sessions/${id}`);
  revalidatePath("/");
}

export async function deleteSession(form: FormData) {
  const supabase = await createClient();
  await supabase.from("sessions").delete().eq("id", str(form, "id"));
  revalidatePath("/");
  redirect("/");
}

/** Clone last week's session with dates pushed forward — the recurrence helper. */
export async function duplicateSession(form: FormData) {
  const supabase = await createClient();
  const shiftDays = Number(str(form, "shift_days") || 7);

  const { data: original } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", str(form, "id"))
    .single<GameSession>();
  if (!original) return;

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      sport_id: original.sport_id,
      title: original.title,
      share_token: newShareToken(),
      poll_start_date: shiftDate(original.poll_start_date, shiftDays),
      poll_end_date: shiftDate(original.poll_end_date, shiftDays),
      day_start_time: original.day_start_time,
      day_end_time: original.day_end_time,
      slot_minutes: original.slot_minutes,
      min_players_full: original.min_players_full,
      full_duration_minutes: original.full_duration_minutes,
      min_players_short: original.min_players_short,
      short_duration_minutes: original.short_duration_minutes,
      venue_id: original.venue_id,
      notes: original.notes,
    })
    .select("id")
    .single();

  if (error || !data) {
    const message = error?.message ?? "Could not duplicate the session.";
    redirect(`/sessions/${original.id}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/sessions/${data.id}`);
}
