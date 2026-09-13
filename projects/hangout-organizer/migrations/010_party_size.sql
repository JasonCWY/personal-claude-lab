-- ---------------------------------------------------------------------------
-- 010: let someone answer for more than just themselves.
--
-- "I'm free Tuesday, and I'm bringing two mates" was unanswerable. The only
-- way to record it was to add those mates to the roster and answer on their
-- behalf — which pollutes the roster with people who came once, and quietly
-- breaks the "waiting on" list, because a person invented to carry a headcount
-- never answers a poll again.
--
-- Modelled on poll_responses rather than on availability: how many people
-- someone brings is a property of their ANSWER, not of each half-hour they
-- ticked. Nobody brings two friends at 19:00 and one at 20:00, and pretending
-- otherwise would multiply the availability table by a number that is almost
-- always 1.
--
-- This changes what `min_players_full` counts. It used to mean rows; it now
-- means bodies on a court, which is what it always meant to a human — six
-- responders where two bring a friend is eight players, and booking a court
-- for six was the wrong answer. See quorum.ts.
--
-- Default 1, not 0: the person answering is themselves coming. A decline
-- leaves this at 1 and it is ignored, since they are not coming at all.
--
-- The ceiling is arbitrary but not optional — this feeds a headcount that
-- decides how long a court gets booked for, and it arrives from a public
-- endpoint that anyone with the share link can post to.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

alter table poll_responses
  add column if not exists party_size integer not null default 1;

do $$
begin
  alter table poll_responses
    add constraint poll_responses_party_size_sane check (party_size between 1 and 20);
exception
  when duplicate_object then null;
end $$;
