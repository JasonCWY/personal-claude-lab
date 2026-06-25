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
  database.py           # Supabase service_role client singleton
  models/               # Pydantic request/response models
  routers/
    bills.py            # POST/GET/PATCH /api/bills, POST /api/bills/{id}/share
    participants.py     # POST/GET/DELETE /api/bills/{id}/participants
    selections.py       # GET/POST /api/bills/{id}/join/{token}[/selections]
    payments.py         # POST /api/bills/{id}/payments, GET /api/bills/{id}/summary
  services/
    calculator.py       # Pure Python calculation engine — no FastAPI/Supabase imports
    receipt_parser.py   # Gemini Vision structured parsing (free tier, gemini-2.0-flash)
    storage.py          # Supabase Storage upload/download

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
- All Supabase writes go through the FastAPI backend (service_role key). The frontend never writes to Supabase directly.
- The `actual_payer_id` FK on `bills` is added via `ALTER TABLE` after `participants` is created (circular reference workaround).

## Environment

Copy `../../.env.example` to `../../.env` (root) and add:
```
ANTHROPIC_API_KEY=...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=...
SUPABASE_ANON_KEY=...
```

## Database Setup

Run `migrations/001_initial_schema.sql` in the Supabase SQL editor. Create a private Storage bucket named `receipts`.
