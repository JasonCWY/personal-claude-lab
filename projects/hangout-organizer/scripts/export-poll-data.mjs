/**
 * Read-only export of everything migration 013 truncates.
 *
 * 013 wipes the poll data and starts fresh on the per-date window model. That
 * is a deliberate choice rather than a backfill, but "deliberate" is not the
 * same as "unrecoverable", so run this first: it writes one JSON file holding
 * every row that is about to go, and it only ever SELECTs.
 *
 *   node scripts/export-poll-data.mjs
 *
 * Output lands in backups/, which is gitignored — these rows name real people.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Exactly the tables named in 013's truncate, plus the roster and venues —
// those are NOT dropped, but a restore of the poll data is meaningless without
// the people the person_ids point at.
const TABLES = [
  "polls",
  "poll_invitees",
  "availability",
  "poll_responses",
  "sessions",
  "session_optouts",
  "attendees",
  "people",
  "roster_groups",
  "roster_group_members",
  "venues",
  "sports",
];

const dump = { exported_at: new Date().toISOString(), tables: {} };

for (const table of TABLES) {
  const { data, error } = await db.from(table).select("*");
  if (error) throw new Error(`${table}: ${error.message}`);
  dump.tables[table] = data;
  console.log(`  ${table.padEnd(22)} ${data.length} rows`);
}

mkdirSync(join(root, "backups"), { recursive: true });
const out = join(root, "backups", `pre-013-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(out, JSON.stringify(dump, null, 2), "utf8");
console.log(`\nWrote ${out}`);
