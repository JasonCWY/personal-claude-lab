-- debt-tracker schema (SQLite).
--
-- This app used to run on the Supabase project shared with reader-assistant.
-- It is local, single-user and never deployed, so it was paying the cost of a
-- hosted Postgres — a network dependency and a free-tier project slot — for
-- nothing. The slot was needed by hangout-organizer, which genuinely is
-- deployed. See CLAUDE.md § Why SQLite.
--
-- Differences from the old Postgres schema, all deliberate:
--   * UUIDs are generated in Python (db.new_id()); SQLite has no gen_random_uuid().
--   * Money is REAL rounded to 2dp on write, which is what NUMERIC(10,2) did.
--   * Timestamps are ISO-8601 UTC text.
--   * No RLS. There is no auth and no network — the file is the boundary.
--   * created_by is gone. It referenced auth.users and only ever held a
--     placeholder zero-UUID.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bills (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  receipt_image_url TEXT,
  currency          TEXT NOT NULL DEFAULT 'MYR',
  subtotal          REAL,
  tax               REAL DEFAULT 0,
  service_charge    REAL DEFAULT 0,
  total             REAL,
  actual_payer_id   TEXT REFERENCES participants(id),
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'settled')),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS participants (
  id              TEXT PRIMARY KEY,
  bill_id         TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  display_name    TEXT NOT NULL,
  invite_token    TEXT NOT NULL UNIQUE,
  is_birthday     INTEGER NOT NULL DEFAULT 0,
  birthday_opt_in INTEGER NOT NULL DEFAULT 0,
  has_selected    INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  bill_id     TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  unit_price  REAL NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  total_price REAL GENERATED ALWAYS AS (ROUND(unit_price * quantity, 2)) STORED,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS item_assignments (
  id                TEXT PRIMARY KEY,
  item_id           TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  participant_id    TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  share_numerator   INTEGER NOT NULL DEFAULT 1,
  share_denominator INTEGER NOT NULL DEFAULT 1,
  UNIQUE (item_id, participant_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id             TEXT PRIMARY KEY,
  bill_id        TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  amount         REAL NOT NULL,
  paid_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  note           TEXT
);

CREATE INDEX IF NOT EXISTS participants_bill_idx   ON participants (bill_id);
CREATE INDEX IF NOT EXISTS items_bill_idx          ON items (bill_id, sort_order);
CREATE INDEX IF NOT EXISTS assignments_item_idx    ON item_assignments (item_id);
CREATE INDEX IF NOT EXISTS assignments_person_idx  ON item_assignments (participant_id);
CREATE INDEX IF NOT EXISTS payments_bill_idx       ON payments (bill_id);
