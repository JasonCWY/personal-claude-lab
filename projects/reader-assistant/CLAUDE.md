# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Personal reading companion. The user manually captures notes and quotes while reading a book elsewhere (physical copy, Kindle, other apps) — there is no book text ingestion/upload. From there the app helps them:

- Look up unfamiliar word/phrase translations, bidirectionally between English and Chinese, auto-saved as flashcards
- Discuss a non-fiction book's ideas with Claude in an open per-book chat
- Get a Claude-written summary and give their own 1–5 star rating once they finish a book

Runs **locally only** — never deployed — to keep infrastructure cost at $0. The only ongoing cost is Claude API token usage.

## Running Locally

**Backend** (Python 3.11+ required — on this machine that's the `py -3.14` launcher, not the default `python`/`pip` on PATH):
```bash
py -3.14 -m pip install -e ".[dev]"
cd src
py -3.14 -m uvicorn backend.main:app --reload --port 8000
```
Note: run uvicorn as `backend.main:app` from the `src/` directory (not `main:app` from `src/backend/`) — `main.py` uses relative imports (`from .routers import ...`), which only resolve correctly when `backend` is imported as a package.

**Frontend** (Node 20+ required):
```bash
cd src/frontend
npm install
npm run dev   # starts on :5173, proxies /api → localhost:8000
```

**Tests:**
```bash
py -3.14 -m pytest tests/ -v
```

## Architecture

```
src/backend/
  main.py               # FastAPI app
  config.py             # pydantic-settings reads root .env; also load_dotenv()s it
                         #   into os.environ so shared/claude_client.py can read it
  database.py            # Supabase service_role client singleton
  models/                # Pydantic request/response models
  routers/
    books.py             # POST/GET/PATCH /api/books, POST /api/books/{id}/finish
    notes.py             # POST/GET/DELETE /api/books/{id}/notes
    flashcards.py        # POST /api/translate, GET/DELETE /api/flashcards
    chat.py               # POST/GET /api/books/{id}/chat
  services/
    book_metadata.py     # Google Books API lookup (free, no key) for cover/genre/is_fiction
    translator.py         # CJK-detection (pure fn) + Claude call for EN<->ZH translation
    summarizer.py          # Claude call grounded on a book's notes/quotes
    chat_service.py        # Claude call for open per-book discussion (NOT grounded on notes)

src/frontend/src/
  App.jsx                # React Router: / | /books/new | /books/:bookId | /flashcards
  api/client.js           # fetch wrapper for all /api/* calls
  pages/
    Library.jsx           # Book list
    AddBook.jsx            # Title/author -> auto-fetched metadata -> create
    BookDetail.jsx          # Notes/quotes, translate lookup, chat (non-fiction only), finish flow
    Flashcards.jsx           # All saved word/phrase translations, sortable by book/date
```

## Key Design Rules

- **No book text ingestion.** The app never stores or displays the book's actual content — only what the user manually captures. `summarizer.py`'s prompt explicitly tells Claude to acknowledge sparse notes rather than invent details about the book.
- **Chat is gated on `is_fiction === false`.** `routers/chat.py` returns 400 if a book's `is_fiction` isn't exactly `False` (covers both `True` and unknown/`None`). The frontend also hides the chat panel client-side, but the backend is the actual gate.
- **Chat is deliberately not grounded on notes** — it's an open discussion, not Q&A over captured content. The summary, by contrast, *is* grounded on notes (it's the only source of book content the app has).
- **Language detection is pure and unit-tested** (`translator.detect_lang`): any CJK character in the input means the source is Chinese, otherwise English, and translation goes the other direction.
- All Supabase writes go through the FastAPI backend (`service_role` key). The frontend never talks to Supabase directly, and there's no RLS — this is a single-user local app, not multi-tenant.
- Uses `shared/claude_client.py` for the Anthropic client (per root `CLAUDE.md`), not a locally instantiated one.

## Environment

Reuses the root `.env` (no project-specific env file):
```
ANTHROPIC_API_KEY=...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=...
```

## Database Setup

Run `migrations/001_initial_schema.sql` in the Supabase SQL editor (same project as `debt-tracker` is fine — tables are namespaced by name, no conflicts).
