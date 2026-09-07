-- hangout-organizer — initial schema
-- Run this in the Supabase SQL editor of a DEDICATED project.
-- Do NOT run it in the project shared by debt-tracker / reader-assistant: this app
-- publishes its anon key to the browser, and those two projects have RLS switched off.

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table if not exists sports (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null unique,
  -- "ideally 6 people for 2 hours, but 4 people is enough for 1 hour"
  min_players_full        int  not null default 6,
  full_duration_minutes   int  not null default 120,
  min_players_short       int  not null default 4,
  short_duration_minutes  int  not null default 60,
  created_at              timestamptz not null default now(),
  constraint sports_short_below_full check (min_players_short <= min_players_full)
);

create table if not exists venues (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  sport_id                  uuid references sports(id) on delete set null,
  platform_name             text,          -- e.g. "Courtsite", "direct WhatsApp"
  booking_url               text,
  price_per_hour            numeric(10,2),
  peak_price_per_hour       numeric(10,2),
  currency                  text not null default 'MYR',
  booking_opens_days_ahead  int,           -- how far ahead the platform opens booking
  address                   text,
  notes                     text,
  is_active                 boolean not null default true,
  created_at                timestamptz not null default now()
);

create table if not exists people (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create unique index if not exists people_display_name_key
  on people (lower(display_name));

-- ---------------------------------------------------------------------------
-- Sessions (badminton / pickleball)
-- ---------------------------------------------------------------------------

create table if not exists sessions (
  id                          uuid primary key default gen_random_uuid(),
  sport_id                    uuid not null references sports(id) on delete restrict,
  title                       text not null,
  status                      text not null default 'polling'
                                check (status in ('polling','confirmed','cancelled','completed')),
  share_token                 text not null unique,

  -- the window being polled
  poll_start_date             date not null,
  poll_end_date               date not null,
  day_start_time              time not null default '18:00',
  day_end_time                time not null default '22:00',
  slot_minutes                int  not null default 30,

  -- copied from the sport at creation, editable per session
  min_players_full            int  not null,
  full_duration_minutes       int  not null,
  min_players_short           int  not null,
  short_duration_minutes      int  not null,

  -- filled in once you lock it down
  venue_id                    uuid references venues(id) on delete set null,
  confirmed_start_at          timestamptz,
  confirmed_duration_minutes  int,

  notes                       text,
  created_at                  timestamptz not null default now(),

  constraint sessions_poll_range   check (poll_end_date >= poll_start_date),
  constraint sessions_day_range    check (day_end_time > day_start_time),
  constraint sessions_slot_minutes check (slot_minutes in (30, 60))
);

create index if not exists sessions_status_idx on sessions (status, poll_start_date desc);
create index if not exists sessions_confirmed_idx on sessions (confirmed_start_at)
  where confirmed_start_at is not null;

-- One row per person per slot they are free. Absence of a row means "not free".
create table if not exists availability (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  person_id   uuid not null references people(id)   on delete cascade,
  slot_start  timestamptz not null,
  created_at  timestamptz not null default now(),
  unique (session_id, person_id, slot_start)
);

create index if not exists availability_session_idx on availability (session_id, slot_start);

-- Who has actually answered the poll, so you can chase the people who haven't.
create table if not exists session_responses (
  session_id    uuid not null references sessions(id) on delete cascade,
  person_id     uuid not null references people(id)   on delete cascade,
  submitted_at  timestamptz not null default now(),
  comment       text,
  primary key (session_id, person_id)
);

-- Final headcount after the session is confirmed.
create table if not exists attendees (
  session_id  uuid not null references sessions(id) on delete cascade,
  person_id   uuid not null references people(id)   on delete cascade,
  status      text not null default 'in' check (status in ('in','out','maybe')),
  primary key (session_id, person_id)
);

-- ---------------------------------------------------------------------------
-- Events (party / airbnb / karaoke) and checklists
-- ---------------------------------------------------------------------------

create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  event_type   text not null default 'other',
  event_date   date,
  location     text,
  share_token  text not null unique,
  status       text not null default 'planning'
                 check (status in ('planning','confirmed','done','cancelled')),
  notes        text,
  created_at   timestamptz not null default now()
);

create table if not exists event_tasks (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references events(id) on delete cascade,
  title               text not null,
  notes               text,
  assignee_person_id  uuid references people(id) on delete set null,
  due_date            date,
  is_done             boolean not null default false,
  done_at             timestamptz,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists event_tasks_event_idx on event_tasks (event_id, sort_order);

create table if not exists checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  event_type  text not null default 'other',
  is_builtin  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists checklist_template_items (
  id                  uuid primary key default gen_random_uuid(),
  template_id         uuid not null references checklist_templates(id) on delete cascade,
  title               text not null,
  notes               text,
  sort_order          int not null default 0,
  days_before_offset  int             -- N days before event_date -> task due_date
);

create index if not exists checklist_template_items_tpl_idx
  on checklist_template_items (template_id, sort_order);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Single-host app: any authenticated user (and only your allowlisted email can
-- ever get a session) has full access. `anon` gets NO policies at all, so the
-- anon key shipped to the browser can read nothing directly. Every public share
-- page goes through a server route handler using the service_role key, which
-- bypasses RLS.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'sports','venues','people','sessions','availability','session_responses',
    'attendees','events','event_tasks','checklist_templates','checklist_template_items'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists host_all on %I', t);
    execute format(
      'create policy host_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------

insert into sports (name, min_players_full, full_duration_minutes, min_players_short, short_duration_minutes)
values
  ('Badminton',  6, 120, 4, 60),
  ('Pickleball', 6, 120, 4, 60)
on conflict (name) do nothing;

insert into checklist_templates (name, event_type, is_builtin)
values
  ('House Party',   'party',   true),
  ('Airbnb Trip',   'airbnb',  true),
  ('Karaoke Night', 'karaoke', true)
on conflict (name) do nothing;

insert into checklist_template_items (template_id, title, notes, sort_order, days_before_offset)
select t.id, i.title, i.notes, i.sort_order, i.days_before_offset
from (values
  ('House Party',   'Lock the date and confirm headcount',     null,                                   1, 14),
  ('House Party',   'Send the invite to the group',            null,                                   2, 12),
  ('House Party',   'Plan food and drinks',                    'Ask about allergies and non-drinkers', 3,  7),
  ('House Party',   'Split the shopping list',                 null,                                   4,  5),
  ('House Party',   'Sort out the playlist and speaker',       null,                                   5,  3),
  ('House Party',   'Buy groceries, ice and cups',             null,                                   6,  1),
  ('House Party',   'Tidy up and set out the food',            null,                                   7,  0),
  ('House Party',   'Collect everyone''s share',               'Move to debt-tracker once deployed',   8,  0),
  ('Airbnb Trip',   'Agree on dates and budget per person',    null,                                   1, 45),
  ('Airbnb Trip',   'Shortlist listings and share with group', 'Check the cancellation policy',        2, 40),
  ('Airbnb Trip',   'Book the place',                          null,                                   3, 35),
  ('Airbnb Trip',   'Sort transport',                          'Flights, car rental or who drives',    4, 30),
  ('Airbnb Trip',   'Assign rooms and beds',                   null,                                   5, 14),
  ('Airbnb Trip',   'Plan meals and groceries',                null,                                   6,  7),
  ('Airbnb Trip',   'Build the itinerary',                     'Leave room for doing nothing',         7,  5),
  ('Airbnb Trip',   'Share check-in details and house rules',  null,                                   8,  2),
  ('Airbnb Trip',   'Settle the final split',                  null,                                   9,  0),
  ('Karaoke Night', 'Confirm who is coming',                   null,                                   1,  7),
  ('Karaoke Night', 'Book the room',                           'Check minimum spend and time slot',    2,  5),
  ('Karaoke Night', 'Confirm package and pricing',             null,                                   3,  4),
  ('Karaoke Night', 'Share the location and time',             null,                                   4,  2),
  ('Karaoke Night', 'Build a shared song queue',               null,                                   5,  1),
  ('Karaoke Night', 'Settle the bill and split it',            null,                                   6,  0)
) as i(template_name, title, notes, sort_order, days_before_offset)
join checklist_templates t on t.name = i.template_name
where not exists (
  select 1 from checklist_template_items x
  where x.template_id = t.id and x.title = i.title
);
