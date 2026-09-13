import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHostIdentity } from "@/lib/auth";

/**
 * Register or drop one of the host's devices for push notifications.
 *
 * Note what this is NOT under: `api/public/`. Middleware therefore already
 * requires a session here, but that is the outer gate, not the real one — the
 * same reasoning as `(host)/layout.tsx`. Middleware proves *somebody* is signed
 * in; Supabase will mint a session for any address that completes a sign-in, so
 * this re-checks that the somebody is the host, and then writes through the
 * COOKIE-BOUND client rather than the service client so the `host_all` policy
 * decides at the database too. A stranger's valid JWT gets nothing.
 *
 * That choice matters more here than on most tables. A push subscription is a
 * bearer handle: anyone who can write one can make the host's phone ring, and
 * anyone who can read one can do it without ever touching this app.
 */

const MAX_ENDPOINT = 2000;
const MAX_KEY = 200;
const MAX_LABEL = 80;

interface Body {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  label?: unknown;
}

/** Bound every field before it reaches the database, as the public routes do. */
function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

async function requireHost() {
  const { hostEmail } = await getHostIdentity();
  return hostEmail ? null : NextResponse.json({ error: "Not the host" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const denied = await requireHost();
  if (denied) return denied;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const endpoint = str(body.endpoint, MAX_ENDPOINT);
  const p256dh = str(body.keys?.p256dh, MAX_KEY);
  const auth = str(body.keys?.auth, MAX_KEY);
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Incomplete subscription" }, { status: 400 });
  }
  // The endpoint is a URL the server will later POST to. Refusing anything but
  // https keeps a crafted body from turning this table into a way to aim the
  // server at an arbitrary host.
  if (!endpoint.startsWith("https://")) {
    return NextResponse.json({ error: "Endpoint must be https" }, { status: 400 });
  }

  const supabase = await createClient();
  // Upsert, not insert: the client re-registers on every host page load,
  // because push subscriptions rotate without telling anyone and the only
  // symptom is notifications quietly never arriving again.
  const { error } = await supabase.from("push_subscriptions").upsert(
    { endpoint, p256dh, auth, label: str(body.label, MAX_LABEL) },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.error("[push] could not save subscription:", error.message);
    return NextResponse.json({ error: "Could not save subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const denied = await requireHost();
  if (denied) return denied;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const endpoint = str(body.endpoint, MAX_ENDPOINT);
  if (!endpoint) return NextResponse.json({ error: "endpoint is required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) {
    console.error("[push] could not delete subscription:", error.message);
    return NextResponse.json({ error: "Could not turn notifications off" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
