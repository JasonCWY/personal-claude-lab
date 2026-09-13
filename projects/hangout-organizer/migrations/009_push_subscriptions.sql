-- ---------------------------------------------------------------------------
-- 009: let the host's own devices receive a push when someone answers a poll.
--
-- Scope is deliberately narrow: this table holds the HOST's browsers, nobody
-- else's. Friends have no account, no session and no contact detail anywhere in
-- this schema — `people` is a display_name and nothing more — so there is no
-- way to address a notification to them, and inventing one is a much larger
-- change than this. The host already has a real identity, so notifying only the
-- host is the version of this feature that needs no new personal data at all.
--
-- Keyed on `endpoint` because that is what a push subscription IS: a unique,
-- per-browser-per-device URL minted by the vendor's push service (FCM, APNs,
-- Mozilla). Two rows for a phone and a laptop is the normal case. There is no
-- person_id column, because there is only ever one person in here.
--
-- These are not credentials the host chose and they are not secrets the host
-- can rotate — they are bearer handles. Anyone able to read a row could push a
-- notification to that device, which is precisely why the table is gated by the
-- same host_all policy as everything else and why the anon key can never see
-- it. `p256dh` and `auth` are the browser's public key and shared secret for
-- the payload encryption; without them a push can only ring, not say anything.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists push_subscriptions (
  endpoint        text primary key,
  p256dh          text not null,
  auth            text not null,
  -- "Pixel 8 · Chrome", so a stale row is recognisable when pruning by hand.
  label           text,
  created_at      timestamptz not null default now(),
  -- Stamped on every successful send. A row whose last_success_at falls far
  -- behind the others is a device that has silently stopped receiving.
  last_success_at timestamptz
);

-- Same policy shape as every other table — see 007. A new table with RLS on and
-- no policy is closed, which fails safe but shows up as an empty list in the
-- host UI rather than an error, so this is not optional.
alter table push_subscriptions enable row level security;
drop policy if exists host_all on push_subscriptions;
create policy host_all on push_subscriptions for all to authenticated
  using ((select public.is_host())) with check ((select public.is_host()));

-- No index beyond the primary key. The only read this table ever serves is
-- "give me every row", because a fan-out to all of the host's devices is the
-- whole point; the only write is an upsert keyed on the endpoint, which the
-- primary key already covers.
