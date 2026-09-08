-- Date-only polls: "which dates suit everyone for the trip?"
--
-- Modelled as a poll whose slot is a whole day rather than half an hour, which
-- means the quorum engine needs no change: "6 of us free for 3 consecutive
-- days" is the same intersection question as "6 of us free for 2 consecutive
-- hours", just with a bigger step. slot_minutes = 1440 for these.
--
-- sport_id becomes nullable, because the thing being decided on a date poll is
-- a trip or a weekend away, not a court booking. The activity's own title
-- carries the meaning instead.
--
-- Run in the SQL editor. Safe to re-run.

alter table polls
  add column if not exists granularity text not null default 'time';

alter table polls drop constraint if exists polls_granularity_check;
alter table polls add constraint polls_granularity_check
  check (granularity in ('time', 'date'));

-- A whole-day slot is 1440 minutes.
alter table polls drop constraint if exists polls_slot_minutes;
alter table polls add constraint polls_slot_minutes
  check (slot_minutes in (15, 30, 60, 1440));

-- A date poll ignores the time-of-day bounds, so they must be allowed to match.
alter table polls drop constraint if exists polls_day_range;
alter table polls add constraint polls_day_range
  check (granularity = 'date' or day_end_time <> day_start_time);

alter table sessions alter column sport_id drop not null;
