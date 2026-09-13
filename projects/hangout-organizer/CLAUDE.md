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
polls                 window + share_token + status + closes_at; the thing
                      friends answer
  poll_invitees       who was asked, FROZEN at creation
  availability        poll_id + person_id + slot_start
  poll_responses      who submitted, when, any comment, `declined`, and
                      `party_size` — how many they are bringing
  sessions            an activity to book within the poll; own thresholds,
                      own venue, own confirmed_start_at, own court_number
    attendees         who was free for the window that got confirmed
roster_groups         named sets of people
  roster_group_members
push_subscriptions    the HOST's devices, for "someone answered" notifications
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
    ResponseSummary.tsx      Voted / can't make it / not answered, side by side.
    BookableBlocks.tsx       Grouped windows as a per-day timeline + confirm form.
    AudiencePicker.tsx       Everyone / a group / hand-picked, with a live preview.
    ActivityPicker.tsx       Which sports this poll is trying to book.
    GroupEditor.tsx          Create and edit roster groups.
    ShareMessage.tsx         Editable WhatsApp message preview + copy.
    MonthCalendar.tsx        Month grid; dots + an agenda list below `sm`.
    HostNav.tsx              The five host destinations: inline bar, or bottom tabs on a phone.
    ThemeToggle.tsx          Light / match device / dark. Writes the preference only.
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
- **Thresholds count BODIES, not rows.** `min_players_full` was always talking about people on
  a court; until `party_size` existed (migration 010) responders and players happened to be the
  same number. Six responders where two bring a friend is eight players, and booking a court for
  six was simply wrong. Every quorum comparison goes through `headcountOf()`, and the intersection
  loop in `computeCandidates` weighs the set rather than counting it — stopping on `people.size`
  would discard windows that four responders bringing friends genuinely fill. What a block claims
  is still carried by the PEOPLE in it: `groupCandidates` merges on a subset test over the person
  sets, never on the weighted totals, or two different groups that happen to sum to the same
  number would collapse into a block neither sustains.
- **A poll can close itself, and that is not a background job.** `closes_at` is evaluated per
  request by `lib/poll-state.ts` — the public page renders from it, the submit route enforces it,
  the host page explains it, and all three ask the same function so they cannot drift. A deadline
  that only greys out a button is not a deadline: the endpoint is public, and a late answer
  silently changes the headcount under a booking already made. `status` and `closes_at` stay
  separate on purpose — status is what the host DECIDED, `closes_at` is what they ANNOUNCED — and
  clearing the cut-off is how you reopen a poll that shut itself. An unparseable `closes_at` is
  treated as no deadline, because a link that silently refuses every answer is the worse failure.
- **A `datetime-local` field is Kuala Lumpur wall-clock, never the server's clock.** `optInstant()`
  in `actions.ts` reads it through `klToInstant`. The functions run in Tokyo (see Deploying), so
  `new Date(value)` would have quietly moved every deadline an hour.
- **`SITE_URL()` always carries a scheme.** Typed into the Vercel dashboard this gets written the
  way a domain is spoken — `my-app.vercel.app` — and everything downstream still looks fine, but a
  bare domain is not a URL, so iOS and WhatsApp render it as plain grey text with nothing to tap.
  The share message is the entire distribution mechanism for this app; it cannot depend on how
  carefully an environment variable was typed months ago.
- **Declining is the other answer, not fine print.** It was an underlined text link — the
  treatment you reach for to keep a destructive action quiet — and that was the bug. It is not
  destructive, and the person who needs it has to find it on a phone below a month-long grid. It
  is now a bordered full-width control, still outlined rather than filled so it cannot be mistaken
  for Submit.
- **Times are `timestamptz` UTC in the DB, rendered in Asia/Kuala_Lumpur at the edges.**
  `slots.ts` uses fixed +8 arithmetic because Malaysia has no DST — do not copy that to a timezone
  that does.
- **A `day_end_time` at or before `day_start_time` means the NEXT day.** 22:00–00:00 is an ordinary
  evening session and must work; 21:00–01:00 rolls the post-midnight slots onto the following
  date. Only equality is rejected, since that would mean 24 hours.
- **Colour is only ever named semantically, never as a palette step.** `tailwind.config.ts` maps
  tokens — `surface`, `ink`, `line`, `accent`, `ok`/`warn`/`bad`/`info`, `slot`, `heat` — onto CSS
  variables, and `globals.css` defines those variables twice: once on `:root` and once under
  `.dark`. So a component written as `bg-surface text-ink` is correct in both themes by
  construction, and adding a theme is one block of variables rather than a second class on every
  element. **A literal `bg-white`, `text-slate-500` or `bg-emerald-100` anywhere in `src/` is a
  bug**: it will look right in light mode and wrong in dark, which is exactly the failure nobody
  notices in review. `grep -r "slate-\|bg-white\|emerald-" src` should stay empty.
- **Every foreground/background token pair clears WCAG AA in BOTH themes**, and that is checked
  arithmetically, not by eye. Inverting a palette does not preserve contrast: a mid-emerald dark
  enough for white text on a white page is too dark to read as "selected" on a dark one, so the
  filled greens and ambers flip their *foreground* between themes while the fill stays saturated.
  The hot end of the heatmap ramp and the amber "short session" bar both failed AA before this and
  looked perfectly fine. If you add or retune a token, recompute the ratios.
- **The theme is applied by an inline script in the root layout, before first paint.** Doing it in
  React would render light, hydrate, then switch — the white flash that gives away a bolted-on
  dark mode. That is also why `<html>` carries `suppressHydrationWarning`: the script mutates its
  class list before React ever sees it. `ThemeToggle` only writes the preference and re-applies
  it; it never owns the initial value.
- **44px is the tap-target floor** (`min-h-tap`). Most people open this app on a phone, and the
  friend-facing pages are opened on a phone by someone who has never seen it before. Fields keep
  `text-base` for a second reason: iOS Safari zooms the page when a focused input's text is under
  16px and does not zoom back out.
- **`position: sticky` needs a scroll container that actually scrolls on that axis.** `overflow-x`
  makes an element a scroll container on *both* axes, so a `sticky top-0` inside one of the grid
  wrappers silently never fires. The sticky time column works because that is the axis the
  wrapper scrolls; a sticky day-header row would not, and was removed rather than left inert.
- **Sharing is a clipboard hand-off, not an integration.** The WhatsApp Business API is neither
  free nor worth it here; `CopyLink` builds a paste-ready message instead.

## Notifications

Web Push, to the HOST's own devices, fired from the request that records an answer. Nothing here
is scheduled and nothing costs anything.

- **Host-only, because there is nowhere to send a friend a notification.** `people` is a
  `display_name` and nothing else — no email, no phone, no identity. Adding a contact channel for
  friends is a much larger change than this was; notifying the one person who actually has an
  account needs no new personal data at all.
- **Web Push rather than email or WhatsApp.** It goes straight to the browser vendors' services
  (FCM/APNs/Mozilla): no account, no quota, no bill, which is the same constraint that keeps an
  LLM out of this project. Email would need a Resend/Postmark account and an address per person.
- **Fired in `after()`, from the public availability route.** The counts and the fan-out run once
  the friend's response is already on the wire, so Saving… is no slower than before — which was
  the point of the latency work in e857d58. Everything in that block swallows its own errors: a
  failure to notify is not a failure to record an answer.
- **One notification per poll, replaced rather than stacked.** The submit endpoint is open to
  anyone with the share link, so the number of pushes is bounded only by how many times someone
  taps Save. The per-poll `tag` collapses them, and the body carries a running count so nothing is
  lost by replacing the earlier ones. `renotify` is what still makes it buzz.
- **`public/sw.js` has no `fetch` handler and no cache, deliberately.** Every page here is
  `force-dynamic` because a poll is wrong the moment someone else answers. A caching worker would
  serve friends a stale grid, silently, on the page opened by people who have never seen this app.
  If you ever add caching, exclude `/s/` and `/e/` and think hard about the rest.
- **The manifest is declared on `(host)/layout.tsx`, not the root layout.** Only the host should be
  installing this, and friends opening a share link should get no install prompt and no worker.
- **iOS only allows push from an installed app.** Safari exposes `PushManager` to a Home Screen
  site and not to a tab, so `PushToggle` detects that case and says "Add to Home Screen" rather
  than "unsupported". Android and desktop need only the permission prompt.
- **`push_subscriptions` rows are bearer handles, not credentials the host chose.** Anyone who can
  read one can ring that device. Hence the same `host_all` policy as every other table, and
  `api/push/subscribe` writing through the COOKIE-BOUND client so RLS decides, not the service key.
- **Subscriptions rotate silently.** `PushToggle` re-registers on every host page load when
  permission is already granted, and `sendHostPush` deletes a row on a 404/410 — and only on those,
  since deleting on a transient 500 would unsubscribe the host during someone else's outage.
- **Never rotate the VAPID pair.** The public key is baked into every subscription a browser has
  already made; a new pair invalidates every device and the only symptom is silence.

## Environment

See `.env.local.example`. Three of the variables are the Web Push pair plus its subject; generate
them once with `npx web-push generate-vapid-keys` and then leave them alone (see Notifications).
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` is public on purpose — the browser must hand it to
`pushManager.subscribe`, and it authenticates the sender rather than authorising anything.

`HOST_EMAIL` is the real gate — Supabase will mint a session for any
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
add it to the policy loop — `push_subscriptions` (migration 009) is the most recent one to join it — a table with RLS on and no policy is closed, which fails safe, but a
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
  scheduled jobs. Notifications did not change this: they are fired by the request that records an
  answer, and a poll's cut-off is evaluated when someone asks rather than by something waking up.
  The first feature that genuinely needs a scheduler — "remind everyone who has not answered" — is
  also the first that needs a way to reach friends, and neither exists.
- **Notifying friends.** Only the host can be notified; see Notifications for why.
