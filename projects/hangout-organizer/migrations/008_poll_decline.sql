-- ---------------------------------------------------------------------------
-- 008: let someone answer a poll by saying "none of these work".
--
-- Until now the only way to answer was to submit times. Someone who genuinely
-- cannot make any of the polled window had two bad options: submit an empty
-- grid, which recorded a response with no visible trace and left the host
-- unable to tell it apart from a mis-tap; or not answer, which left them
-- sitting in "waiting on" forever while the host chased someone who had
-- already made up their mind.
--
-- A declined response is a REAL answer. It is not the absence of one, and it is
-- not the same thing as opting out of an activity (005) — that says "I am free
-- then, just not for badminton". This says "I am not free at all."
--
-- Modelled as a column on poll_responses rather than a status enum because the
-- row already means "this person answered"; declining is a property of the
-- answer, and every existing row is by definition not a decline.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

alter table poll_responses
  add column if not exists declined boolean not null default false;

-- A decline means no availability, and the route enforces that on write. This
-- constraint is deliberately NOT expressed in the database: availability lives
-- in another table, so it would need a trigger, and a trigger that can silently
-- reject a friend's submission is worse than the invariant it protects. The
-- host page treats declined as authoritative and ignores stray slots either
-- way, so the failure mode is cosmetic rather than a wrong quorum.
