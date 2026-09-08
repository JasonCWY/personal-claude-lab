-- "Which of these are you up for?" — per-activity opt-in on a multi-activity poll.
--
-- A friend answers WHEN they are free once. Without this, that single answer
-- counts toward every activity in the poll, so someone free on Tuesday evening
-- is treated as a pickleball player whether or not they have ever held a
-- pickleball racket.
--
-- Stored as opt-OUTS, not opt-ins, and the absence of a row means "in". That is
-- deliberate: it keeps the property that made the poll restructure worth doing
-- — adding an activity to a running poll needs nobody to answer again. The cost
-- is that people who answered before an activity existed are counted for it
-- until they say otherwise, so the host page shows who those people are.

create table if not exists session_optouts (
  session_id uuid not null references sessions(id) on delete cascade,
  person_id  uuid not null references people(id) on delete cascade,
  primary key (session_id, person_id)
);

create index if not exists session_optouts_person_idx on session_optouts (person_id);

alter table session_optouts enable row level security;
drop policy if exists host_all on session_optouts;
create policy host_all on session_optouts for all to authenticated
  using (public.is_host()) with check (public.is_host());
