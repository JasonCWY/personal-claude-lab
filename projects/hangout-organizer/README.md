# Hangout Organizer

Stop running the group's plans out of a WhatsApp poll.

- **Sessions** — open a poll over a date range and time window. Friends tap their name on a share
  link and drag the slots they're free. The app finds the windows where enough of the *same* people
  are free right through, applies your booking rule (6 people → 2 hours, 4 → 1 hour), and lets you
  confirm one against a venue in a click.
- **Venues** — the booking directory: which platform, what URL, price per hour, peak price, how far
  ahead booking opens, court notes.
- **Calendar** — month view of confirmed sessions and dated events.
- **Events** — party / Airbnb / karaoke, with checklists built from reusable templates, assignees
  and due dates counted back from the event date.

Only you sign in. Friends never create an account — they use the link you paste into the group.

## Stack

Next.js (App Router) · Supabase Postgres · Vercel · Tailwind. All on free tiers.
**No LLM and no AI API key** — v1 is deliberately zero-cost.

## Setup

1. **Create a new Supabase project.** Use a dedicated one, not the project shared by
   `debt-tracker` / `reader-assistant` — this app publishes an anon key to the browser and those
   two run with RLS disabled.
2. Open `migrations/001_initial_schema.sql`, replace `you@example.com` near the bottom with your
   own address (it must match `HOST_EMAIL`), then run the whole file in that project's SQL editor.
   That address is what the RLS policies check — leave the placeholder in and every page comes up
   empty.
3. In Supabase → Authentication → URL Configuration, add `http://localhost:3000/auth/callback`
   (and later your Vercel URL) to the redirect allowlist.
4. In Supabase → Authentication → Sign In / Providers, turn **off** "Allow new users to sign up".
   The anon key is public, so without this anyone can create a user in your project. They still
   could not read anything (see step 2), but there is no reason to let them try.
5. Copy the env template and fill it in:

   ```bash
   cp .env.local.example .env.local
   ```

   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
   come from Supabase → Project Settings → API. `HOST_EMAIL` is the only address allowed to sign in.

6. Install and run:

   ```bash
   npm install
   npm run dev     # http://localhost:3000
   ```

> Node 20+ required. On this machine Node lives at `C:\Program Files\nodejs` and is not on PATH.

## First run

1. Sign in at `/login` with `HOST_EMAIL` and follow the magic link.
2. **Roster** — add your regulars. Friends pick their own name from this list.
3. **Venues** — add at least one court with its booking URL and price.
4. **New session** — set the poll window; thresholds prefill from the sport and can be overridden
   for that session only.
5. Copy the WhatsApp message and paste it into the group.
6. As answers land, the session page shows a density heatmap plus a ranked list of bookable
   windows. Confirm one and the venue's booking link is right there.
7. Next week: **Duplicate for next week** clones it with the dates shifted and a fresh link.

## Tests

```bash
npm test
```

Covers the quorum engine and the Kuala Lumpur slot maths — including the case that motivates the
whole design: six people free at 19:00 and a *different* six at 20:00 does **not** make a bookable
two-hour block.

## Deploying to Vercel

New Project → this repo → set **Root Directory** to `projects/hangout-organizer`. Add the same env
vars in the dashboard, with `NEXT_PUBLIC_SITE_URL` set to the production URL so share links point
at the right place. Add that URL to Supabase's redirect allowlist too.

## Not included

Payment tracking is deliberately out of v1 — that belongs with `debt-tracker`. The `attendees`
table already records who turned up, which is what a future link between the two will hang on.
