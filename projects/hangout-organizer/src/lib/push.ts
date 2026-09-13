import "server-only";

import webpush, { type PushSubscription, WebPushError } from "web-push";
import { createServiceClient } from "@/lib/supabase/service";
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "@/lib/env";
import type { PushPayload } from "@/lib/push-message";

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string | null;
}

/**
 * web-push keeps the VAPID details in module state, so this must run before the
 * first send. Lazy rather than at import time because `env.ts` throws on a
 * missing variable, and a missing push key must not take down the availability
 * endpoint — friends submitting answers is the feature; notifying the host is
 * the garnish.
 */
let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(VAPID_SUBJECT(), VAPID_PUBLIC_KEY(), VAPID_PRIVATE_KEY());
  configured = true;
}

/**
 * Fan a notification out to every device the host has registered.
 *
 * Called from `after()` on the public availability endpoint, so it runs once
 * the friend's response is already on the wire. Nothing in here may throw: a
 * push failure must never turn a successfully recorded answer into an error the
 * friend sees, and the host would rather miss a buzz than have someone tell
 * them "the link said it couldn't save".
 */
export async function sendHostPush(payload: PushPayload): Promise<void> {
  try {
    configure();
  } catch (error) {
    // Push not configured on this deployment. Not worth a noisy log on every
    // single submission, but silence here is what a misconfigured Vercel
    // project looks like from the outside, so say it once per cold start.
    console.warn("[push] VAPID not configured, skipping:", (error as Error).message);
    return;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, label");
  if (error) {
    console.error("[push] could not read subscriptions:", error.message);
    return;
  }

  const subscriptions = (data ?? []) as StoredSubscription[];
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  const alive: string[] = [];

  // Settled, not all: one dead device must not stop the host's other phone from
  // ringing.
  await Promise.allSettled(
    subscriptions.map(async (row) => {
      const subscription: PushSubscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(subscription, body, { TTL: 60 * 60 });
        alive.push(row.endpoint);
      } catch (error) {
        /*
         * 404 and 410 are the push service saying this endpoint is gone for
         * good — the browser was uninstalled, site data was cleared, or the
         * subscription was rotated. Every other status is transient and the row
         * must survive it. Deleting on, say, a 500 would quietly unsubscribe
         * the host's phone during someone else's outage.
         */
        const status = error instanceof WebPushError ? error.statusCode : 0;
        if (status === 404 || status === 410) dead.push(row.endpoint);
        else console.error("[push] send failed", status, (error as Error).message);
      }
    }),
  );

  await Promise.allSettled([
    dead.length
      ? supabase.from("push_subscriptions").delete().in("endpoint", dead)
      : Promise.resolve(),
    alive.length
      ? supabase
          .from("push_subscriptions")
          .update({ last_success_at: new Date().toISOString() })
          .in("endpoint", alive)
      : Promise.resolve(),
  ]);
}
