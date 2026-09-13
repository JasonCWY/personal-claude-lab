-- ---------------------------------------------------------------------------
-- 012: record which court, and tell everyone.
--
-- The venue gets someone to the right building. The court number is what stops
-- six people standing in the lobby texting "which one?" — and it is only known
-- at the moment of booking, which is exactly when the host is already in the
-- confirm form.
--
-- text, not integer. Courts are labelled "3", "A2", "Court 7 (back)" and
-- "Hall 2 / 5" depending on the venue, and the app never does arithmetic on
-- this — it prints it.
--
-- Optional, because plenty of bookings do not have one yet when they are
-- confirmed, and refusing to confirm without it would be a worse trade.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

alter table sessions
  add column if not exists court_number text;
