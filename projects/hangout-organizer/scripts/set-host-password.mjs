/**
 * Set a password on the host account, once.
 *
 * The host user was created through the admin API with no password, because the
 * app originally only did magic links. Run this to add one:
 *
 *   node scripts/set-host-password.mjs
 *
 * It prompts with the input hidden, so the password never reaches your shell
 * history. Reads the project URL and secret key from .env.local, which is
 * gitignored — nothing here is committed.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function env(name) {
  const text = readFileSync(join(root, ".env.local"), "utf8");
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} not found in .env.local`);
  return line.slice(name.length + 1).trim();
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Swallow the echo so the password is not printed as it is typed.
    const onData = (char) => {
      if (["\n", "\r", "\u0004"].includes(String(char))) process.stdin.removeListener("data", onData);
      else process.stdout.write("\u001b[2K\u001b[200D" + prompt + "*".repeat(rl.line.length));
    };
    process.stdin.on("data", onData);
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
const hostEmail = env("HOST_EMAIL").toLowerCase();

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const listed = await fetch(`${url}/auth/v1/admin/users`, { headers }).then((r) => r.json());
const user = (listed.users ?? []).find((u) => (u.email ?? "").toLowerCase() === hostEmail);
if (!user) {
  console.error(`No user found for ${hostEmail}. Sign in with a magic link once, then re-run.`);
  process.exit(1);
}

const password = await askHidden(`New password for ${hostEmail}: `);
const again = await askHidden("Confirm: ");

if (password !== again) {
  console.error("Those did not match. Nothing changed.");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Supabase requires at least 8 characters. Nothing changed.");
  process.exit(1);
}

const res = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ password, email_confirm: true }),
});

if (!res.ok) {
  console.error("Failed:", res.status, (await res.text()).slice(0, 200));
  process.exit(1);
}

console.log(`Password set for ${hostEmail}. You can now sign in without the email round trip.`);
