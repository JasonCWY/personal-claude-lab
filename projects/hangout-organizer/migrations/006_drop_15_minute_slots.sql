-- Drop the 15-minute slot size.
--
-- Courts book by the hour, and a finer grid is mostly more to tap on a phone.
-- 60 is now the default, 30 the only alternative.
--
-- OPTIONAL TIDY-UP: nothing breaks without it. The app never offers 15 any more,
-- so this only stops the database accepting a value the UI cannot produce. Safe
-- to run whenever you are next in the SQL editor. It will fail if a poll with
-- 15-minute slots exists — there were none when this was written.

alter table polls drop constraint if exists polls_slot_minutes;

alter table polls add constraint polls_slot_minutes
  check (slot_minutes in (30, 60, 1440));
