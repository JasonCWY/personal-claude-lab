-- ---------------------------------------------------------------------------
-- 013: a poll is a list of dated windows, not a rectangle.
--
-- Until now a poll carried ONE time window — day_start_time to day_end_time —
-- and applied it to every day between poll_start_date and poll_end_date. That
-- is the right shape for a weekly court booking and the wrong shape for almost
-- anything else: a group that plays Tuesday evenings and Saturday mornings had
-- to poll 09:00-22:00 on both days and let the grid ask thirteen questions to
-- get at four, or run two polls and lose the clash detection that made one
-- poll own availability in the first place (see 003).
--
-- So the polled set becomes explicit. `poll_windows` holds one row per
-- (date, start, end), the host picks the dates individually rather than
-- sweeping a range, and a date may carry more than one window.
--
-- WHAT DOES NOT CHANGE: `availability` is still poll_id + person_id +
-- slot_start, and lib/quorum.ts is untouched. The engine never knew about the
-- window — it works off whatever slot instants exist plus one slot size — so a
-- ragged poll is scored by exactly the code that scored a rectangular one. A
-- date the host skipped simply produces no slots, which makes it a real break
-- in the run rather than a day nobody happened to tick.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Clear the poll data.
--
-- There is no backfill path worth writing. Expanding the old rectangle into
-- per-date rows is easy, but it would carry forward exactly one expired poll,
-- and every read path is changing shape underneath it — so the fixture would
-- cost more to keep honest than it is worth.
--
-- Deliberately NARROW. The roster (`people`, `roster_groups`,
-- `roster_group_members`), the venue directory, the sports and their
-- thresholds, the checklist templates and the host's `push_subscriptions` are
-- all untouched: none of them has anything to do with how a poll's window is
-- shaped, and re-entering thirteen friends by hand would be a self-inflicted
-- wound. `events` and `event_tasks` are likewise a separate feature.
--
-- Listed explicitly rather than relying on the cascade, so that what is
-- destroyed is legible here rather than inferred from foreign keys.
-- ---------------------------------------------------------------------------

truncate table
  attendees,
  session_optouts,
  availability,
  poll_responses,
  sessions,
  poll_invitees,
  polls
cascade;

-- ---------------------------------------------------------------------------
-- 2. The polled set.
--
-- Both times null means a WHOLE-DATE window — the trip case, where the
-- question is which days suit and the time of day is not being asked. Either
-- both are set or neither is; a half-specified window has no meaning.
--
-- An end at or before the start means the NEXT day, exactly as day_end_time
-- did: 22:00-00:00 is an ordinary evening and 21:00-01:00 rolls the
-- post-midnight slots forward. Only equality is rejected, since that would be
-- a 24-hour window.
--
-- Overlapping windows on one date are ALLOWED and folded by mergeWindows() in
-- lib/slots.ts. The host's list is kept as they typed it; only the derived
-- grid is normalised. The unique constraint catches the exact-duplicate case
-- cheaply — `nulls not distinct` so two whole-date rows for one date collide
-- rather than both landing.
-- ---------------------------------------------------------------------------

create table if not exists poll_windows (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references polls(id) on delete cascade,
  day_date   date not null,
  start_time time,
  end_time   time,

  constraint poll_windows_times_paired
    check ((start_time is null) = (end_time is null)),
  constraint poll_windows_range
    check (start_time is null or start_time <> end_time),
  constraint poll_windows_unique
    unique nulls not distinct (poll_id, day_date, start_time, end_time)
);

-- Every read is "the windows of this poll, in order", which is also the order
-- the grid renders them in.
create index if not exists poll_windows_poll_idx
  on poll_windows (poll_id, day_date, start_time);

-- ---------------------------------------------------------------------------
-- 3. RLS.
--
-- Same host_all policy as every other table — see 003 for why this is scoped
-- to the host by email rather than to `authenticated`, and 007 for the
-- `(select ...)` wrapper that keeps the check out of the per-row loop.
--
-- The public /s/ page reads through the service client, which bypasses RLS, so
-- `anon` needs nothing here. A new table with RLS on and no policy is closed,
-- which fails safe — but it would show up as a poll with no dates rather than
-- as an error, so the policy is not optional.
-- ---------------------------------------------------------------------------

alter table poll_windows enable row level security;

drop policy if exists host_all on poll_windows;
create policy host_all on poll_windows for all to authenticated
  using ((select public.is_host())) with check ((select public.is_host()));

-- ---------------------------------------------------------------------------
-- 4. Retire the poll-level window.
--
-- `poll_start_date` and `poll_end_date` STAY, but their meaning narrows: they
-- are the min and max of the picked dates, kept denormalised because
-- polls_status_idx and the dashboard's ordering are built on them and would
-- otherwise need a join per list render. They are derived bounds, NOT the
-- polled set — a poll over three scattered Tuesdays has bounds two weeks apart
-- and asks about three days. Anything rendering "when is this poll" must read
-- poll_windows and go through formatDateList(); the bounds are for sorting.
--
-- They cannot drift, because a poll's dates are fixed at creation and there is
-- no edit path that changes them.
-- ---------------------------------------------------------------------------

alter table polls drop constraint if exists polls_day_range;
alter table polls drop constraint if exists polls_day_range_or_date;

alter table polls drop column if exists day_start_time;
alter table polls drop column if exists day_end_time;

comment on column polls.poll_start_date is
  'Earliest picked date. A derived bound for sorting — the polled set lives in poll_windows.';
comment on column polls.poll_end_date is
  'Latest picked date. A derived bound for sorting — the polled set lives in poll_windows.';
