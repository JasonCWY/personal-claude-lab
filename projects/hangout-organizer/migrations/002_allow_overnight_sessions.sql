-- Allow sessions that run past midnight (e.g. 22:00-00:00, or 21:00-01:00).
--
-- The original constraint was `day_end_time > day_start_time`, which reads as
-- "a session must end after it starts" but actually forbids the ordinary case
-- of an evening session ending at midnight — 00:00 sorts before 22:00 as a
-- time-of-day, so the check failed and the New Session form rejected it.
--
-- An end at or before the start now means the NEXT day; `slots.ts` builds the
-- grid accordingly. Equality is still rejected, since a start equal to its end
-- would mean a 24-hour window rather than a zero-length one.
--
-- Run this in the SQL editor of the hangout-organizer Supabase project. Safe to
-- re-run.

alter table sessions drop constraint if exists sessions_day_range;

alter table sessions add constraint sessions_day_range
  check (day_end_time <> day_start_time);
