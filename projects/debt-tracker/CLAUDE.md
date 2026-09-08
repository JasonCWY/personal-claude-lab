# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Bill-splitting web app. User uploads a receipt photo → Claude Vision parses it → participants open unique invite links to tick their items → app calculates each person's share and tracks payment.

Supports 4 splitting scenarios: individual, shared (N-way split), birthday (person's share zeroed + redistributed), third-party payer (someone else paid; creator collects and settles).

## Running Locally

**Backend** (Python 3.11+ required):
```bash
cd src/backend
pip install -e "../../.[dev]"
uvicorn main:app --reload --port 8000
```

**Frontend** (Node 20+ required):
```bash
cd src/frontend
npm install
npm run dev   # starts on :5173, proxies /api → localhost:8000
```

**Tests:**
```bash
python -m pytest tests/ -v
```

## Architecture

```
src/backend/
  main.py               # FastAPI app
  config.py             # pydantic-settings reads root .env
  database.py           # SQLite connection + query helpers
  models/               # Pydantic request/response models
  routers/
    bills.py            # POST/GET/PATCH /api/bills, POST /api/bills/{id}/share
    participants.py     # POST/GET/DELETE /api/bills/{id}/participants
    selections.py       # GET/POST /api/bills/{id}/join/{token}[/selections]
    payments.py         # POST /api/bills/{id}/payments, GET /api/bills/{id}/summary
  services/
    calculator.py       # Pure Python calculation engine — no FastAPI/DB imports
    receipt_parser.py   # Gemini Vision structured parsing (free tier, gemini-2.0-flash)
    storage.py          # Receipt images on the local filesystem

src/frontend/src/
  App.jsx               # React Router: / | /bill/:id | /bill/:id/join/:token
  api/client.js         # fetch wrapper for all /api/* calls
  pages/
    CreateBill.jsx      # Upload receipt → navigate to dashboard
    BillDashboard.jsx   # Creator view: items, participants, share, payments
    JoinBill.jsx        # Participant view: tick items, submit selections
```

## Key Design Rules

- `services/calculator.py` is a pure function: takes dataclasses in, returns `CalculationResult`. Zero external imports. Always test here first when changing splitting logic.
- Receipt parser uses `response_mime_type="application/json"` on Gemini to force structured output, then validates with Pydantic. Never trust unvalidated free-text responses.
- All database access goes through the FastAPI backend. The frontend only ever calls `/api/*`.
- **Money is REAL in SQLite, rounded to 2dp on write (`database.money`) and quantized to 2dp on
  read (`database.to_money`).** Both halves are needed: `NUMERIC(10,2)` used to guarantee this, and
  without `to_money` the API answers `"37.0"` where it used to answer `"37.00"`, and float
  artefacts leak into totals. Never build a money `Decimal` straight from a SQLite value.
- **Ids are minted in Python (`database.new_id`)**, including `participants.invite_token`. SQLite
  has no `gen_random_uuid()`.
- A selection submission **replaces** that participant's assignments rather than merging. Note the
  consequence, which predates the SQLite move: if A shares an item with B and B later submits
  without it, B's share is dropped and the remainder falls into `unassigned_amount`.

## Why SQLite

This app used to run on the Supabase project shared with `reader-assistant`. It moved to a local
SQLite file on 2026-09-08 because the free tier allows two projects and `hangout-organizer` — the
only genuinely deployed app in this repo — needed one of them.

The move was the right shape regardless: debt-tracker is local, single-user, never deployed, and
ran with the `service_role` key against RLS-off tables. It was paying for a hosted Postgres with a
network dependency, a project slot and a database that free-tier auto-pause puts to sleep between
uses. A file has none of those problems, and receipt storage got *simpler* — a folder instead of a
bucket.

Do not reintroduce a Supabase dependency here. If this app is ever deployed, that is the moment to
revisit it, and RLS becomes mandatory at the same time — see the root CLAUDE.md.

## Environment

Copy `../../.env.example` to `../../.env` (root). debt-tracker reads exactly one key:

```
GEMINI_API_KEY=...
```

## Database Setup

None. `database.get_db()` creates `data/debt-tracker.db` from `migrations/001_initial_schema.sql`
on first use; the statements are all `IF NOT EXISTS`, so it is safe on every boot. Receipt images
go to `data/receipts/<bill_id>/original.jpg`. The whole `data/` directory is gitignored — it is
your real data and it never leaves the machine.

### The one-shot Supabase export

`scripts/export_from_supabase.py` and `scripts/import_to_sqlite.py` moved the existing rows and
receipt images across. They are kept for reference and for re-running before the Supabase project
is deleted; neither is part of normal operation. The export reads the root `.env` directly, since
`config.py` no longer carries Supabase settings.
