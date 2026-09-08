# Debt Tracker

Split a restaurant bill from a photo of the receipt.

Upload the receipt, Gemini parses it into line items, then each person opens their own invite
link and ticks what they had. The app works out who owes what and tracks who has paid.

Four splitting cases are handled:

- **Individual** — you had it, you pay for it.
- **Shared** — an item split N ways between whoever claims it.
- **Birthday** — the birthday person's share is zeroed and redistributed across everyone else.
- **Third-party payer** — someone else actually paid the restaurant, so the creator collects and
  settles up with them.

## Stack

FastAPI · React (Vite) · **local SQLite** · Gemini `gemini-2.0-flash` for receipt parsing.

No hosted database and no account. Everything lives in `data/` on this machine — see
[CLAUDE.md § Why SQLite](CLAUDE.md).

## Setup

Python 3.11+ and Node 20+.

1. Copy `../../.env.example` to `../../.env` and set `GEMINI_API_KEY`. That is the only key this
   project needs — Gemini's free tier covers receipt parsing.

2. Backend:

   ```bash
   pip install -e ".[dev]"
   cd src/backend
   uvicorn main:app --reload --port 8000
   ```

3. Frontend, in a second terminal:

   ```bash
   cd src/frontend
   npm install
   npm run dev      # http://localhost:5173, proxies /api → :8000
   ```

There is no database step. The SQLite file and its schema are created on first request, and
receipt images are written to `data/receipts/`. The whole `data/` directory is gitignored.

## Tests

```bash
python -m pytest tests/ -v
```

The splitting logic in `src/backend/services/calculator.py` is a pure function with no FastAPI or
database imports — change behaviour there and in `tests/test_calculator.py` before touching a
router.

## Note on `data/`

`data/` holds your real bills and receipt photos and is never committed. `data/supabase-export/`
is a one-shot dump from when this project ran on Supabase; see `scripts/` for the export and
import scripts. Neither runs during normal use.
