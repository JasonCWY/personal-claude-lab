CREATE TABLE books (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  author       TEXT,
  cover_url    TEXT,
  language     TEXT,
  genre        TEXT,
  is_fiction   BOOLEAN,
  status       TEXT NOT NULL DEFAULT 'reading'
    CHECK (status IN ('reading', 'finished')),
  rating       INTEGER
    CHECK (rating BETWEEN 1 AND 5),
  summary      TEXT,
  started_at   TIMESTAMPTZ DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id     UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('note', 'quote')),
  content     TEXT NOT NULL,
  location    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE flashcards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id          UUID REFERENCES books(id) ON DELETE SET NULL,
  source_text      TEXT NOT NULL,
  source_lang      TEXT NOT NULL CHECK (source_lang IN ('en', 'zh')),
  translated_text  TEXT NOT NULL,
  target_lang      TEXT NOT NULL CHECK (target_lang IN ('en', 'zh')),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id     UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notes_book_id ON notes(book_id);
CREATE INDEX idx_flashcards_book_id ON flashcards(book_id);
CREATE INDEX idx_chat_messages_book_id ON chat_messages(book_id);

-- Single-user local app: the backend talks to Supabase only via the
-- service_role key (which bypasses RLS), and the frontend never calls
-- Supabase directly. No RLS/auth policies needed.
