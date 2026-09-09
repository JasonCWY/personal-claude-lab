# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Organising tool for a friend group. Two jobs:

1. **Weekly badminton / pickleball sessions.** Host opens a poll over a date + time window,
   friends drag the slots they are free on a public link, and the app surfaces the windows where
   enough of the *same* people are free to actually book a court. Venues (platform, price, how far
   ahead booking opens) live in a directory so that knowledge stops living in the host's head.
2. **One-off events** — party, Airbnb trip, karaoke — with checklists generated from reusable
   templates, assignees and due dates.

## Deliberate divergences from the rest of this repo

This is the **only deployed project** here, and it breaks several repo norms on purpose:

| Repo norm (debt-tracker, reader-assistant) | Here | Why |
|---|---|---|
| FastAPI + Vite React, two processes | One Next.js App Router app | Vercel free tier hosts it as a single deploy |
| Runs locally only | Deployed to Vercel | Friends must be able to open the link from WhatsApp |
| Shares one Supabase project | **Its own Supabase project** | This app publishes an anon key to the browser; the other two run with RLS off |
| No RLS | RLS on every table | See above |
| No auth | Supabase Auth, host only | A public URL needs a gate |
| Root `.env` | Its own `.env.local` | Vercel supplies env at build/run time |
| Uses `shared/claude_client.py` | **No LLM at all** | v1 is deliberately zero-cost; see below |

## No LLM in v1

There is no Anthropic/Gemini/OpenAI call anywhere in this project, and no API key in its env.
Checklists come from static templates seeded by the migration and editable at `/templates`.

This was a cost decision: a Claude Pro subscription does **not** cover Anthropic API usage (separate
billing), and a public deployed app calling an LLM means anyone with the link can spend the host's
credits. If an assistant is added later, put it **behind host auth**, never on the `/s/` or `/e/`
public pages.

## Running Locally

Node 20+ (Node 24 on this machine; note `node` is **not** on PATH — it lives at
`C:\Program Files\nodejs`).

```bash
cp .env.local.example .env.local   # then fill in the Supabase values
npm install
npm run dev                        # http://localhost:3000
npm test                           # vitest — quorum + slot maths
```

## Architecture

### The data model, and why

A **poll** owns a window of time and the share token. **Sessions** hang off it as the things you
are trying to book, each carrying its own quorum rule. Availability belongs to the *poll*.

That split is the central decision. Whether someone is free on Tuesday has nothing to do with
which sport is being planned, so storing availability per session meant asking the same question
twice for badminton and pickleball over the same dates — two links, two grids — and nothing was in
a position to notice that confirming both for Tuesday 8pm double-books half the group. One poll,
many sessions: friends answer once, every session is scored against those answers, and
`overlappingPeople()` can answer the clash question because both sessions share a poll.

```
polls                 window + share_token + status; the thing friends answer
  poll_invitees       who was asked, FROZEN at creation
  availability        poll_id + person_id + slot_start
  poll_responses      who submitted, when, any comment, and `declined`
  sessions            an activity to book within the poll; own thresholds,
                      own venue, own confirmed_start_at
    attendees         who was free for the window that got confirmed
roster_groups         named sets of people
  roster_group_members
```

```
src/
  middleware.ts              Session refresh + host gate. Excludes /s/, /e/, /api/public/.
  lib/
    quorum.ts                PURE. The scheduling engine. No framework imports.
    slots.ts                 PURE. Slot grid, KL conversion, display formatting.
    actions.ts               Server actions: roster, groups, venues, polls, sessions.
    event-actions.ts         Server actions: events, tasks, templates.
    supabase/browser.ts      Publishable key. Auth flow ONLY — never app tables.
    supabase/server.ts       Cookie-bound, runs as `authenticated`, RLS applies.
    supabase/service.ts      Secret key, BYPASSES RLS. `server-only`.
  components/
    AvailabilityGrid.tsx     Friend-facing drag grid. Touch is the primary target.
    HeatmapGrid.tsx          Host-facing per-slot density.
    BookableBlocks.tsx       Grouped windows as a per-day timeline + confirm form.
    AudiencePicker.tsx       Everyone / a group / hand-picked, with a live preview.
    ActivityPicker.tsx       Which sports this poll is trying to book.
    GroupEditor.tsx          Create and edit roster groups.
    ShareMessage.tsx         Editable WhatsApp message preview + copy.
  app/
    (host)/                  Behind auth: dashboard, polls, calendar, venues,
                             roster + groups, events, templates.
    s/[token]/               PUBLIC availability poll.
    e/[token]/               PUBLIC event checklist.
    api/public/…             The only write path for unauthenticated friends.
```

## Key Design Rules

- **`lib/quorum.ts` is pure and tested first.** Same rule as debt-tracker's `calculator.py`.
  Change behaviour there and in `tests/quorum.test.ts` before touching any page.
- **A window is scored on the INTERSECTION of its slots, never the per-slot maximum.** Six people
  free at 19:00 and a different six at 20:00 is not a bookable two-hour block. This is the single
  most important invariant in the codebase and it has a dedicated test.
- **Anything a poll depends on is COPIED onto it at creation, never referenced.** Sport thresholds
  are copied onto the session; group membership is resolved into `poll_invitees`. Editing a sport
  or a group afterwards must never rewrite the rules, or the audience, of a poll already running.
- **A window is scored on the intersection of its slots, then overlapping windows are GROUPED.**
  With 30-minute slots and a 2-hour rule, one 3-hour free stretch yields five candidates.
  `groupCandidates()` collapses them into a block, and merging stops the moment the sustained
  headcount would drop — a block must never advertise people who are not free across all of it.
- **Public pages have no Supabase session, so route handlers authorise themselves.** Every handler
  under `api/public/` re-derives the poll/event from the share token and validates that the person
  was **invited to that poll** — not merely on the roster — and that the slots are inside the
  polled window. Never trust the client body, and bound every field before it reaches the
  database: these endpoints are open to anyone with the link.
- **The friend-facing grid replaces, it does not merge.** A submission is that person's complete
  answer, so cleared slots must actually disappear.
- **There are three distinct answers, and they must not be collapsed.** No `poll_responses` row
  means *not answered yet* — chase them. `declined` means *not free for any of this window* — a
  real answer, so they leave the "waiting on" list and nobody chases them. A `session_optouts` row
  means *free then, just not for that activity* (migration 005). Submitting an empty grid has
  always recorded the same state as a decline, but nobody guesses that, so it needs the explicit
  button: without one people either leave the link unanswered or invent a slot they cannot make,
  and both are worse for the host than a plain no. A decline carries no availability, and the
  route enforces that by ignoring any slots sent alongside it.
- **Times are `timestamptz` UTC in the DB, rendered in Asia/Kuala_Lumpur at the edges.**
  `slots.ts` uses fixed +8 arithmetic because Malaysia has no DST — do not copy that to a timezone
  that does.
- **A `day_end_time` at or before `day_start_time` means the NEXT day.** 22:00–00:00 is an ordinary
  evening session and must work; 21:00–01:00 rolls the post-midnight slots onto the following
  date. Only equality is rejected, since that would mean 24 hours.
- **Sharing is a clipboard hand-off, not an integration.** The WhatsApp Business API is neither
  free nor worth it here; `CopyLink` builds a paste-ready message instead.

## Environment

See `.env.local.example`. `HOST_EMAIL` is the real gate — Supabase will mint a session for any
address that completes a magic link, so `auth/callback/route.ts` signs out anyone who is not the
host, and `(host)/layout.tsx` re-checks on every render.

## Sign-in

Password by default, magic link as a fallback. The link round trip — switch to the inbox, wait,
tap, come back — is tedious for the one person who signs in here several times a week, and it adds
nothing: `HOST_EMAIL` plus the `host_allowlist` RLS check are what actually gate this app, not the
delivery mechanism.

The host user is created without a password (originally there was only the link flow), so run
`node scripts/set-host-password.mjs` once to add one. It prompts with the input hidden so the
password never lands in shell history.

**Creating the host user must happen BEFORE disabling public signups in the Supabase dashboard.**
`signInWithOtp` defaults to `shouldCreateUser: true`, so on a fresh project with signups already
off you get "Signups not allowed for this instance" and there is no way in at all — nobody can
sign in because nobody exists, and nobody can be created.

## Database Setup

Create a **new** Supabase project. Before running `migrations/001_initial_schema.sql`, replace the
`you@example.com` placeholder near the bottom with the host address — it must match `HOST_EMAIL`.
The migration creates the tables, enables RLS, and seeds the two sports plus three built-in
checklist templates.

**RLS is scoped to the host by email, not to `authenticated`.** The anon key and project URL both
ship to the browser, so anyone can drive Supabase's auth endpoints directly and obtain a valid
`authenticated` JWT without ever loading this app. `auth/callback` signing non-hosts out and the
`(host)` layout re-check guard the *app*; they do nothing for PostgREST. The `host_allowlist` table
plus the `is_host()` security-definer function are what guard the *data*. If you ever add a table,
add it to the policy loop — a table with RLS on and no policy is closed, which fails safe, but a
table with the old `using (true)` policy would be open to any signed-up stranger.

## Deploying

Vercel → New Project → this repo → **Root Directory: `projects/hangout-organizer`**. Set the five
env vars in the dashboard. In Supabase Auth settings add the Vercel URL to the redirect allowlist,
and set `NEXT_PUBLIC_SITE_URL` to it so share links point at production.

### Functions run in Tokyo, next to the database

`vercel.json` pins `regions: ["hnd1"]`. The Supabase project is in AWS `ap-northeast-1` (Tokyo),
and Vercel's Hobby default is `iad1` (Washington DC) — which put roughly 160ms of trans-Pacific
latency on **every** Supabase query, several of them per page render. Pinning the function to the
database's region turns each of those into a same-region hop.

Tokyo rather than Singapore, even though the friends are in Malaysia: a page render makes several
serial queries to Postgres and the browser makes exactly one request to the function, so the link
worth shortening is function→database, not browser→function. Moving the Supabase project itself
to `ap-southeast-1` would be better still and would let this be `sin1`, but that means recreating
the project — the free tier cannot migrate regions.

Middleware is the exception: it runs on the Edge Runtime at whatever PoP is nearest the visitor
and cannot be pinned. That is why it must not do network I/O — see `middleware.ts`.

## Not in v1

- **Payment tracking.** Court cost splitting and who-has-paid-me-back is deliberately out; it
  belongs with `debt-tracker` once that is deployed. The `attendees` table already records who
  turned up, which is the join key that work will need.
- **Recurring schedules.** "Duplicate for next week" is the recurrence story — no cron, no
  background jobs.
