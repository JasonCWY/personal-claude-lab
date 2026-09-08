"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { newShareToken } from "@/lib/tokens";
import { DAY_MINUTES, shiftDate } from "@/lib/slots";
import type { Poll } from "@/lib/types";

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

// ---------------------------------------------------------------- groups ----

export async function saveGroup(form: FormData) {
  const supabase = await createClient();
  const id = optStr(form, "id");
  const name = str(form, "name");
  if (!name) return;

  const payload = { name, notes: optStr(form, "notes") };
  const groupId = id
    ? ((await supabase.from("roster_groups").update(payload).eq("id", id).select("id").single())
        .data?.id ?? id)
    : (await supabase.from("roster_groups").insert(payload).select("id").single()).data?.id;

  if (groupId) {
    // Membership is replaced, not merged — the form submits the complete list.
    await supabase.from("roster_group_members").delete().eq("group_id", groupId);
    const memberIds = form.getAll("member_ids").map(String).filter(Boolean);
    if (memberIds.length) {
      await supabase
        .from("roster_group_members")
        .insert(memberIds.map((person_id) => ({ group_id: groupId, person_id })));
    }
  }

  revalidatePath("/people");
}

export async function deleteGroup(form: FormData) {
  const supabase = await createClient();
  await supabase.from("roster_groups").delete().eq("id", str(form, "id"));
  revalidatePath("/people");
}

// ----------------------------------------------------------------- polls ----

/**
 * Mirror the DB's CHECK constraints so the host gets a sentence rather than a
 * form that silently does nothing. Keep in step with the `polls_*` constraints.
 */
function validatePollForm(form: FormData): string | null {
  const startDate = str(form, "poll_start_date");
  const endDate = str(form, "poll_end_date");
  if (endDate < startDate) {
    return "The 'poll until' date is before the 'poll from' date.";
  }

  if (str(form, "granularity") === "date") {
    const days = Number(str(form, "date_full_days") || 1);
    if (!Number.isInteger(days) || days < 1) return "How many days must be a whole number, 1 or more.";
    // Asking for a 5-day run inside a 3-day window can never succeed, and
    // failing here is clearer than an empty results page later.
    const windowDays =
      Math.round(
        (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
      ) + 1;
    if (days > windowDays) {
      return `You are asking for ${days} consecutive days but only polling ${windowDays}. Widen the dates, or ask for fewer days.`;
    }
    if (!str(form, "date_activity_title")) return "Give the trip a name.";
    return null;
  }

  // An end at or before the start means the next day, so 22:00–00:00 is valid.
  // Only equality is wrong: that would be a 24-hour window.
  if (str(form, "day_end_time") === str(form, "day_start_time")) {
    return "The earliest start and latest end are the same time.";
  }
  const slot = Number(str(form, "slot_minutes") || 60);
  if (![30, 60].includes(slot)) {
    return "Slot size must be 30 or 60 minutes.";
  }
  if (!form.getAll("session_sport_ids").map(String).filter(Boolean).length) {
    return "Add at least one activity — a poll with nothing to book has nothing to work out.";
  }
  return null;
}

/**
 * Resolve who a poll is addressed to, and freeze that list.
 *
 * Same principle as copying sport thresholds onto a session: editing the group
 * afterwards must not change who a poll already running was sent to.
 */
async function resolveInvitees(
  supabase: Awaited<ReturnType<typeof createClient>>,
  form: FormData,
): Promise<{ groupId: string | null; personIds: string[] }> {
  const mode = str(form, "audience_mode");

  if (mode === "group") {
    const groupId = optStr(form, "group_id");
    if (!groupId) return { groupId: null, personIds: [] };
    const { data } = await supabase
      .from("roster_group_members")
      .select("person_id")
      .eq("group_id", groupId);
    return { groupId, personIds: (data ?? []).map((r) => r.person_id as string) };
  }

  if (mode === "people") {
    return { groupId: null, personIds: form.getAll("person_ids").map(String).filter(Boolean) };
  }

  // "everyone" — snapshot the active roster.
  const { data } = await supabase.from("people").select("id").eq("is_active", true);
  return { groupId: null, personIds: (data ?? []).map((r) => r.id as string) };
}

export async function createPoll(form: FormData) {
  const problem = validatePollForm(form);
  if (problem) {
    redirect(`/polls/new?error=${encodeURIComponent(problem)}`);
  }

  const supabase = await createClient();
  const { groupId, personIds } = await resolveInvitees(supabase, form);
  if (personIds.length === 0) {
    redirect(
      `/polls/new?error=${encodeURIComponent(
        "That leaves nobody to ask. Pick a group with members, or choose people individually.",
      )}`,
    );
  }

  const { data: poll, error } = await supabase
    .from("polls")
    .insert({
      title: str(form, "title") || "Hangout poll",
      share_token: newShareToken(),
      poll_start_date: str(form, "poll_start_date"),
      poll_end_date: str(form, "poll_end_date"),
      day_start_time: str(form, "day_start_time"),
      day_end_time: str(form, "day_end_time"),
      slot_minutes: Number(str(form, "slot_minutes") || 60),
      granularity: str(form, "granularity") === "date" ? "date" : "time",
      group_id: groupId,
      notes: optStr(form, "notes"),
    })
    .select("id")
    .single();

  if (error || !poll) {
    const message = error?.message ?? "Could not create the poll.";
    redirect(`/polls/new?error=${encodeURIComponent(message)}`);
  }

  await supabase
    .from("poll_invitees")
    .insert(personIds.map((person_id) => ({ poll_id: poll.id, person_id })));

  // A date poll has one activity with no sport — a trip is not a court
  // booking. Its durations are given in days and stored as minutes, which is
  // what lets the scheduling engine treat both kinds of poll identically.
  if (str(form, "granularity") === "date") {
    await supabase.from("sessions").insert({
      poll_id: poll.id,
      sport_id: null,
      title: str(form, "date_activity_title"),
      min_players_full: Number(str(form, "date_min_players_full") || 4),
      full_duration_minutes: Number(str(form, "date_full_days") || 1) * DAY_MINUTES,
      min_players_short: Number(str(form, "date_min_players_short") || 3),
      short_duration_minutes: Number(str(form, "date_short_days") || 1) * DAY_MINUTES,
    });
    redirect(`/polls/${poll.id}`);
  }

  // One session per activity picked. Thresholds are copied from the sport now,
  // so editing the sport later never rewrites a poll already running.
  const sportIds = form.getAll("session_sport_ids").map(String).filter(Boolean);
  const { data: sports } = await supabase.from("sports").select("*").in("id", sportIds);
  const bySport = new Map((sports ?? []).map((s) => [s.id as string, s]));

  const rows = sportIds
    .flatMap((sportId) => {
      const sport = bySport.get(sportId);
      if (!sport) return [];
      return [{
        poll_id: poll.id,
        sport_id: sportId,
        title: sport.name as string,
        min_players_full: sport.min_players_full,
        full_duration_minutes: sport.full_duration_minutes,
        min_players_short: sport.min_players_short,
        short_duration_minutes: sport.short_duration_minutes,
        venue_id: optStr(form, `venue_${sportId}`),
      }];
    });

  if (rows.length) await supabase.from("sessions").insert(rows);

  redirect(`/polls/${poll.id}`);
}

export async function setPollStatus(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "id");
  await supabase.from("polls").update({ status: str(form, "status") }).eq("id", id);
  revalidatePath(`/polls/${id}`);
}

export async function updatePollNotes(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "id");
  await supabase.from("polls").update({ notes: optStr(form, "notes") }).eq("id", id);
  revalidatePath(`/polls/${id}`);
}

export async function deletePoll(form: FormData) {
  const supabase = await createClient();
  await supabase.from("polls").delete().eq("id", str(form, "id"));
  revalidatePath("/");
  redirect("/");
}

/** Clone a poll with its dates pushed forward — the recurrence helper. */
export async function duplicatePoll(form: FormData) {
  const supabase = await createClient();
  const shiftDays = Number(str(form, "shift_days") || 7);
  const sourceId = str(form, "id");

  const { data: original } = await supabase
    .from("polls")
    .select("*")
    .eq("id", sourceId)
    .single<Poll>();
  if (!original) return;

  const { data: poll, error } = await supabase
    .from("polls")
    .insert({
      title: original.title,
      share_token: newShareToken(),
      poll_start_date: shiftDate(original.poll_start_date, shiftDays),
      poll_end_date: shiftDate(original.poll_end_date, shiftDays),
      day_start_time: original.day_start_time,
      day_end_time: original.day_end_time,
      slot_minutes: original.slot_minutes,
      granularity: original.granularity,
      group_id: original.group_id,
      notes: original.notes,
    })
    .select("id")
    .single();

  if (error || !poll) {
    const message = error?.message ?? "Could not duplicate the poll.";
    redirect(`/polls/${sourceId}?error=${encodeURIComponent(message)}`);
  }

  // Carry the invitee list and the activities across; availability starts empty.
  const [{ data: invitees }, { data: sessions }] = await Promise.all([
    supabase.from("poll_invitees").select("person_id").eq("poll_id", sourceId),
    supabase.from("sessions").select("*").eq("poll_id", sourceId),
  ]);

  if (invitees?.length) {
    await supabase
      .from("poll_invitees")
      .insert(invitees.map((r) => ({ poll_id: poll.id, person_id: r.person_id })));
  }
  if (sessions?.length) {
    await supabase.from("sessions").insert(
      sessions.map((s) => ({
        poll_id: poll.id,
        sport_id: s.sport_id,
        title: s.title,
        min_players_full: s.min_players_full,
        full_duration_minutes: s.full_duration_minutes,
        min_players_short: s.min_players_short,
        short_duration_minutes: s.short_duration_minutes,
        venue_id: s.venue_id,
      })),
    );
  }

  redirect(`/polls/${poll.id}`);
}

// -------------------------------------------------------------- sessions ----

export async function addSessionToPoll(form: FormData) {
  const supabase = await createClient();
  const pollId = str(form, "poll_id");
  const sportId = str(form, "sport_id");

  const { data: sport } = await supabase.from("sports").select("*").eq("id", sportId).single();
  if (!sport) return;

  await supabase.from("sessions").insert({
    poll_id: pollId,
    sport_id: sportId,
    title: str(form, "title") || sport.name,
    min_players_full: sport.min_players_full,
    full_duration_minutes: sport.full_duration_minutes,
    min_players_short: sport.min_players_short,
    short_duration_minutes: sport.short_duration_minutes,
  });

  revalidatePath(`/polls/${pollId}`);
}

export async function updateSessionRules(form: FormData) {
  const supabase = await createClient();
  const pollId = str(form, "poll_id");

  await supabase
    .from("sessions")
    .update({
      title: str(form, "title"),
      min_players_full: Number(str(form, "min_players_full")),
      full_duration_minutes: Number(str(form, "full_duration_minutes")),
      min_players_short: Number(str(form, "min_players_short")),
      short_duration_minutes: Number(str(form, "short_duration_minutes")),
      venue_id: optStr(form, "venue_id"),
    })
    .eq("id", str(form, "id"));

  revalidatePath(`/polls/${pollId}`);
}

export async function confirmSession(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "id");
  const pollId = str(form, "poll_id");

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

  await supabase.from("attendees").delete().eq("session_id", id);
  if (personIds.length) {
    await supabase
      .from("attendees")
      .insert(personIds.map((person_id) => ({ session_id: id, person_id })));
  }

  revalidatePath(`/polls/${pollId}`);
  revalidatePath("/calendar");
}

export async function unconfirmSession(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "id");
  await supabase
    .from("sessions")
    .update({ status: "planning", confirmed_start_at: null, confirmed_duration_minutes: null })
    .eq("id", id);
  await supabase.from("attendees").delete().eq("session_id", id);
  revalidatePath(`/polls/${str(form, "poll_id")}`);
  revalidatePath("/calendar");
}

export async function setSessionStatus(form: FormData) {
  const supabase = await createClient();
  await supabase.from("sessions").update({ status: str(form, "status") }).eq("id", str(form, "id"));
  revalidatePath(`/polls/${str(form, "poll_id")}`);
  revalidatePath("/calendar");
}

export async function deleteSession(form: FormData) {
  const supabase = await createClient();
  await supabase.from("sessions").delete().eq("id", str(form, "id"));
  revalidatePath(`/polls/${str(form, "poll_id")}`);
}
