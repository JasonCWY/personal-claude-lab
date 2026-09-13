-- ---------------------------------------------------------------------------
-- 011: a poll can close itself.
--
-- Courts have to be booked before they are gone, so "answer by Thursday" is
-- real information the poll never carried. The host said it in the WhatsApp
-- message and then had to remember to come back and close the poll by hand —
-- and an answer arriving after the booking was made is worse than no answer,
-- because it silently changes the headcount under a decision already taken.
--
-- NO SCHEDULER. The deadline is evaluated on each request, exactly where it
-- matters: the public page renders as closed, and the submit endpoint refuses.
-- A poll whose cut-off has passed is closed in every way a friend can observe,
-- while `status` stays a record of what the HOST decided. Keeping those two
-- separate is what lets the host reopen a poll by clearing the cut-off without
-- having to reconstruct why it closed.
--
-- Nullable: most polls do not need one, and a null cut-off must mean "open
-- until I say otherwise" rather than "expired at the epoch".
--
-- timestamptz, like every other instant here — stored UTC, entered and rendered
-- in Asia/Kuala_Lumpur at the edges.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

alter table polls
  add column if not exists closes_at timestamptz;

-- Partial: only rows with a deadline are ever scanned by the dashboard's
-- "closing soon" read, and they are the small minority.
create index if not exists polls_closes_at_idx on polls (closes_at)
  where closes_at is not null;
