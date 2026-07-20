# Reader Assistant

A personal reading companion powered by Claude. Capture notes and quotes while reading elsewhere (physical book, Kindle, other apps), look up unfamiliar words bidirectionally between English and Chinese, discuss non-fiction books with Claude, and get a summary + your own rating when you finish.

## Features
- Add a book by title/author — cover, genre, and fiction/non-fiction are auto-fetched via the Google Books API
- Log notes and quotes against a book (no book text upload — manual capture only)
- On-demand word/phrase translation (English ↔ Chinese), auto-saved as flashcards
- Flashcard list, sortable by book/date
- Open per-book chat with Claude — non-fiction books only
- Claude-generated summary (grounded on your notes/quotes) + your own 1–5 star rating on finishing

## Stack
React + Vite frontend, FastAPI backend, Supabase (Postgres) for storage. Runs locally only — never deployed — so there's no hosting cost; the only recurring cost is Claude API usage.

## Setup
See `CLAUDE.md` for exact run commands, architecture, and database setup.
