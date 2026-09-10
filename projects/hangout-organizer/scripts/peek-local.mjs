/**
 * Read-only local inspection: what polls, sessions and venues exist?
 *
 * Scratch tool for eyeballing local state while developing — it only SELECTs.
 * Run with `node scripts/peek-local.mjs` from the project root.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: sessions, error } = await db
  .from("sessions")
  .select("id, poll_id, title, status, confirmed_start_at, confirmed_duration_minutes, venue_id");
if (error) throw error;
const { data: venues } = await db.from("venues").select("*");
const { data: polls } = await db.from("polls").select("id, title, share_token");

console.log("POLLS:");
for (const p of polls ?? []) console.log(`  ${p.id}  /s/${p.share_token}  ${p.title}`);

const { data: events } = await db.from("events").select("id, title, share_token, event_date");
console.log("\nEVENTS:");
for (const e of events ?? []) console.log(`  /e/${e.share_token}  ${e.event_date ?? "-"}  ${e.title}`);

console.log("\nSESSIONS:");
for (const s of sessions ?? []) {
  const venue = s.venue_id ? venues?.find((v) => v.id === s.venue_id)?.name : "NONE";
  console.log(
    `  [${s.status}] ${s.title} poll=${s.poll_id} start=${s.confirmed_start_at ?? "-"} dur=${
      s.confirmed_duration_minutes ?? "-"
    } venue=${venue}`,
  );
}

console.log("\nVENUES:");
for (const v of venues ?? []) {
  console.log(
    `  ${v.name} | platform=${v.platform_name ?? "-"} | url=${v.booking_url ? "yes" : "no"} | price=${
      v.price_per_hour ?? "-"
    }/${v.peak_price_per_hour ?? "-"} | opens=${v.booking_opens_days_ahead ?? "-"}d | addr=${
      v.address ? "yes" : "no"
    } | notes=${v.notes ? "yes" : "no"}`,
  );
}
