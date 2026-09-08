-- Polls, activities and roster groups.
--
-- WHY: availability is a property of a PERSON AND A WEEK, not of a sport. The
-- old model stored it per session, so planning badminton and pickleball over
-- the same dates meant two share links and asking everyone the same question
-- twice — and nothing could tell you that confirming both for Tuesday 8pm
-- double-books half the group.
--
-- Now a `poll` owns the window and the share token. Sessions hang off it as the
-- things you are trying to book, each keeping its own quorum rule. One link,
-- one grid, every session scored against the same availability, and overlap
-- between two confirmed sessions is answerable because they share a poll.
--
-- Groups: a poll is addressed to a set of people, resolved into poll_invitees
-- at creation. Same principle as copying sport thresholds onto a session —
-- editing a group later must not silently change who a running poll was for.

-- --------------------------------------------------------------------------
-- Roster groups
-- --------------------------------------------------------------------------

create table if not exists roster_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists roster_group_members (
  group_id  uuid not null references roster_groups(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  primary key (group_id, person_id)
);

create index if not exists roster_group_members_person_idx
  on roster_group_members (person_id);

-- --------------------------------------------------------------------------
-- Polls
-- --------------------------------------------------------------------------

create table if not exists polls (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  share_token      text not null unique,
  status           text not null default 'polling'
                     check (status in ('polling','closed')),

  -- the window being polled
  poll_start_date  date not null,
  poll_end_date    date not null,
  day_start_time   time not null default '18:00',
  day_end_time     time not null default '22:00',
  slot_minutes     int  not null default 30,

  -- who it was addressed to; null group means an explicit hand-picked list
  group_id         uuid references roster_groups(id) on delete set null,

  notes            text,
  created_at       timestamptz not null default now(),

  constraint polls_poll_range   check (poll_end_date >= poll_start_date),
  constraint polls_day_range    check (day_end_time <> day_start_time),
  -- 1440 is a whole day, for date-only polls (migration 004).
  constraint polls_slot_minutes check (slot_minutes in (30, 60))
);

-- The resolved invitee list, frozen at creation. A poll shows exactly these
-- people on its public page, whatever happens to the group afterwards.
create table if not exists poll_invitees (
  poll_id   uuid not null references polls(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  primary key (poll_id, person_id)
);

create index if not exists polls_status_idx on polls (status, poll_start_date);

-- --------------------------------------------------------------------------
-- Migrate the existing data in place.
--
-- There is a live poll here with real answers in it, so nothing is dropped and
-- recreated. Each existing session becomes a poll (keeping its share_token, so
-- links already sent to people keep working) plus one session hanging off it.
-- --------------------------------------------------------------------------

insert into polls (
  title, share_token, status,
  poll_start_date, poll_end_date, day_start_time, day_end_time, slot_minutes,
  notes, created_at
)
select
  s.title,
  s.share_token,
  case when s.status = 'polling' then 'polling' else 'closed' end,
  s.poll_start_date, s.poll_end_date, s.day_start_time, s.day_end_time, s.slot_minutes,
  s.notes, s.created_at
from sessions s
where not exists (select 1 from polls p where p.share_token = s.share_token);

-- The old model had no notion of who was invited, so everyone active counts as
-- invited to the polls that already exist.
insert into poll_invitees (poll_id, person_id)
select p.id, pe.id
from polls p
cross join people pe
where pe.is_active
  and not exists (
    select 1 from poll_invitees i where i.poll_id = p.id and i.person_id = pe.id
  );

-- Availability moves from the session to the poll.
alter table availability add column if not exists poll_id uuid references polls(id) on delete cascade;

update availability a
set poll_id = p.id
from sessions s
join polls p on p.share_token = s.share_token
where a.session_id = s.id and a.poll_id is null;

delete from availability where poll_id is null;

alter table availability drop constraint if exists availability_session_id_person_id_slot_start_key;
alter table availability drop column if exists session_id;
alter table availability alter column poll_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'availability_poll_person_slot_key'
  ) then
    alter table availability
      add constraint availability_poll_person_slot_key unique (poll_id, person_id, slot_start);
  end if;
end $$;

create index if not exists availability_poll_idx on availability (poll_id, slot_start);

-- Responses move too, keeping who said what and when.
create table if not exists poll_responses (
  poll_id      uuid not null references polls(id) on delete cascade,
  person_id    uuid not null references people(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  comment      text,
  primary key (poll_id, person_id)
);

insert into poll_responses (poll_id, person_id, submitted_at, comment)
select p.id, r.person_id, r.submitted_at, r.comment
from session_responses r
join sessions s on s.id = r.session_id
join polls p on p.share_token = s.share_token
on conflict (poll_id, person_id) do nothing;

drop table if exists session_responses;

-- --------------------------------------------------------------------------
-- Sessions become the things booked WITHIN a poll
-- --------------------------------------------------------------------------

alter table sessions add column if not exists poll_id uuid references polls(id) on delete cascade;

update sessions s
set poll_id = p.id
from polls p
where p.share_token = s.share_token and s.poll_id is null;

delete from sessions where poll_id is null;

-- 'polling' was a session status in the old model; a session that has not been
-- booked yet is now 'planning', and the poll carries the polling state.
alter table sessions drop constraint if exists sessions_status_check;
update sessions set status = 'planning' where status = 'polling';
alter table sessions add constraint sessions_status_check
  check (status in ('planning','confirmed','cancelled','completed'));

alter table sessions drop constraint if exists sessions_poll_range;
alter table sessions drop constraint if exists sessions_day_range;
alter table sessions drop constraint if exists sessions_slot_minutes;

alter table sessions drop column if exists share_token;
alter table sessions drop column if exists poll_start_date;
alter table sessions drop column if exists poll_end_date;
alter table sessions drop column if exists day_start_time;
alter table sessions drop column if exists day_end_time;
alter table sessions drop column if exists slot_minutes;

alter table sessions alter column poll_id set not null;
alter table sessions alter column status set default 'planning';

create index if not exists sessions_poll_idx on sessions (poll_id);
create index if not exists sessions_confirmed_idx on sessions (confirmed_start_at);

-- attendees keeps its shape; the status column was never used by the app.
alter table attendees drop column if exists status;

-- --------------------------------------------------------------------------
-- RLS on the new tables
--
-- Same rule as everything else here: `authenticated` is not a gate, because
-- anyone can obtain that role straight from Supabase's auth endpoints. Policies
-- name the host via is_host(). `anon` gets nothing; the public /s/ page reads
-- and writes through server route handlers on the secret key.
-- --------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'roster_groups','roster_group_members','polls','poll_invitees',
    'availability','poll_responses','sessions','attendees'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists host_all on %I', t);
    execute format(
      'create policy host_all on %I for all to authenticated '
      'using (public.is_host()) with check (public.is_host())', t);
  end loop;
end $$;

-- --------------------------------------------------------------------------
-- Seed: one group holding everyone currently active, so the group picker is
-- useful immediately rather than starting empty.
-- --------------------------------------------------------------------------

insert into roster_groups (name, notes)
select 'Everyone', 'Everyone active on the roster. Edit this or add your own groups on /people.'
where not exists (select 1 from roster_groups where name = 'Everyone');

insert into roster_group_members (group_id, person_id)
select g.id, p.id
from roster_groups g
cross join people p
where g.name = 'Everyone'
  and p.is_active
  and not exists (
    select 1 from roster_group_members m
    where m.group_id = g.id and m.person_id = p.id
  );
