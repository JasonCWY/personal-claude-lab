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

```
src/
  middleware.ts              Session refresh + host gate. Excludes /s/, /e/, /api/public/.
  lib/
    quorum.ts                PURE. The scheduling engine. No framework imports.
    slots.ts                 PURE. Slot grid + Asia/Kuala_Lumpur conversion.
    actions.ts               Server actions: roster, venues, sessions.
    event-actions.ts         Server actions: events, tasks, templates.
    supabase/browser.ts      Anon key. Auth flow ONLY — never touches app tables.
    supabase/server.ts       Cookie-bound, runs as `authenticated`, RLS applies.
    supabase/service.ts      service_role, BYPASSES RLS. `server-only`.
  app/
    (host)/                  Everything behind auth: dashboard, sessions, calendar,
                             venues, roster, events, templates.
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
- **Sport thresholds are copied onto the session at creation.** Editing a sport must never rewrite
  the rules of a poll already running.
- **Public pages have no Supabase session, so route handlers authorise themselves.** Every handler
  under `api/public/` re-derives the session/event from the share token and validates that the
  person is on the roster and the slots are inside the polled window. Never trust the client body.
- **The friend-facing grid replaces, it does not merge.** A submission is that person's complete
  answer, so cleared slots must actually disappear.
- **Times are `timestamptz` UTC in the DB, rendered in Asia/Kuala_Lumpur at the edges.**
  `slots.ts` uses fixed +8 arithmetic because Malaysia has no DST — do not copy that to a timezone
  that does.
- **Sharing is a clipboard hand-off, not an integration.** The WhatsApp Business API is neither
  free nor worth it here; `CopyLink` builds a paste-ready message instead.

## Environment

See `.env.local.example`. `HOST_EMAIL` is the real gate — Supabase will mint a session for any
address that completes a magic link, so `auth/callback/route.ts` signs out anyone who is not the
host, and `(host)/layout.tsx` re-checks on every render.

## Database Setup

Create a **new** Supabase project, then run `migrations/001_initial_schema.sql` in its SQL editor.
It creates the tables, enables RLS with an `authenticated`-only policy, and seeds the two sports
plus three built-in checklist templates.

## Deploying

Vercel → New Project → this repo → **Root Directory: `projects/hangout-organizer`**. Set the five
env vars in the dashboard. In Supabase Auth settings add the Vercel URL to the redirect allowlist,
and set `NEXT_PUBLIC_SITE_URL` to it so share links point at production.

## Not in v1

- **Payment tracking.** Court cost splitting and who-has-paid-me-back is deliberately out; it
  belongs with `debt-tracker` once that is deployed. The `attendees` table already records who
  turned up, which is the join key that work will need.
- **Recurring schedules.** "Duplicate for next week" is the recurrence story — no cron, no
  background jobs.
