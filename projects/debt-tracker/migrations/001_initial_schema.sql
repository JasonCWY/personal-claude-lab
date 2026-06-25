CREATE TABLE bills (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by        UUID REFERENCES auth.users(id) NOT NULL,
  title             TEXT NOT NULL,
  receipt_image_url TEXT,
  currency          TEXT NOT NULL DEFAULT 'SGD',
  subtotal          NUMERIC(10,2),
  tax               NUMERIC(10,2) DEFAULT 0,
  service_charge    NUMERIC(10,2) DEFAULT 0,
  total             NUMERIC(10,2),
  actual_payer_id   UUID,
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'settled')),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id         UUID REFERENCES bills(id) ON DELETE CASCADE NOT NULL,
  display_name    TEXT NOT NULL,
  invite_token    TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  is_birthday     BOOLEAN DEFAULT false,
  birthday_opt_in BOOLEAN DEFAULT false,
  has_selected    BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE bills ADD CONSTRAINT fk_actual_payer
  FOREIGN KEY (actual_payer_id) REFERENCES participants(id);

CREATE TABLE items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     UUID REFERENCES bills(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  unit_price  NUMERIC(10,2) NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  total_price NUMERIC(10,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE item_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id           UUID REFERENCES items(id) ON DELETE CASCADE NOT NULL,
  participant_id    UUID REFERENCES participants(id) ON DELETE CASCADE NOT NULL,
  share_numerator   INTEGER NOT NULL DEFAULT 1,
  share_denominator INTEGER NOT NULL DEFAULT 1,
  UNIQUE (item_id, participant_id)
);

CREATE TABLE payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id        UUID REFERENCES bills(id) ON DELETE CASCADE NOT NULL,
  participant_id UUID REFERENCES participants(id) NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  paid_at        TIMESTAMPTZ DEFAULT now(),
  note           TEXT
);

-- RLS: enable on all tables
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Bills: creator can do everything; service_role bypasses RLS automatically
CREATE POLICY bills_creator ON bills
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Participants/items/assignments/payments: creator of the bill has full access
CREATE POLICY participants_creator ON participants
  USING (bill_id IN (SELECT id FROM bills WHERE created_by = auth.uid()));

CREATE POLICY items_creator ON items
  USING (bill_id IN (SELECT id FROM bills WHERE created_by = auth.uid()));

CREATE POLICY item_assignments_creator ON item_assignments
  USING (item_id IN (SELECT i.id FROM items i
    JOIN bills b ON b.id = i.bill_id WHERE b.created_by = auth.uid()));

CREATE POLICY payments_creator ON payments
  USING (bill_id IN (SELECT id FROM bills WHERE created_by = auth.uid()));
