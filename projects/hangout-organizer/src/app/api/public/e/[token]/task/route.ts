import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { HangoutEvent } from "@/lib/types";

/**
 * Public task tick. service_role, so it authorises itself: the task must belong
 * to the event the share token names. Without that check any token would let a
 * caller tick a task on any other event.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: { taskId?: string; isDone?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.taskId || typeof body.isDone !== "boolean") {
    return NextResponse.json({ error: "taskId and isDone are required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("share_token", token)
    .maybeSingle<HangoutEvent>();
  if (!event) {
    return NextResponse.json({ error: "Unknown checklist" }, { status: 404 });
  }

  const { error, count } = await supabase
    .from("event_tasks")
    .update(
      { is_done: body.isDone, done_at: body.isDone ? new Date().toISOString() : null },
      { count: "exact" },
    )
    .eq("id", body.taskId)
    .eq("event_id", event.id);

  if (error) {
    return NextResponse.json({ error: "Could not update task" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Task not on this checklist" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
