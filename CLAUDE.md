# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo Overview

Personal workspace for building AI projects powered by the Claude API. `debt-tracker`, `reader-assistant` and `hangout-organizer` are built; `financial-analysis` and `news-summarizer` are still at the planning/scaffold stage.

## Projects

| Project | Purpose |
|---|---|
| `projects/debt-tracker` | Split a restaurant bill from a receipt photo; per-person invite links and payment tracking |
| `projects/financial-analysis` | Earnings reports, SEC filings, portfolio commentary via Claude |
| `projects/news-summarizer` | Daily news digest → summaries, flashcards, Q&A output |
| `projects/reader-assistant` | EN↔中文 translation, note/quote capture, book chat, summary + rating |
| `projects/hangout-organizer` | Group scheduling: availability polls with a booking-quorum engine, venue directory, event checklists |

## Shared Utilities

`shared/claude_client.py` — thin wrapper that returns an `anthropic.Anthropic` client using `ANTHROPIC_API_KEY` from the environment. All projects should import from here rather than instantiate their own clients.

## Environment

Copy `.env.example` to `.env` and fill in keys before running any project.

**Exception:** `hangout-organizer` does not use the root `.env`. It deploys to Vercel and carries
its own `projects/hangout-organizer/.env.local` (see that project's CLAUDE.md). It also uses **no
LLM at all**, so it needs no AI key.

Keys in the root `.env`:
- `ANTHROPIC_API_KEY` — required by `financial-analysis` and `news-summarizer`
- `GEMINI_API_KEY` — required by `debt-tracker` (receipt parsing, free tier)
- `ALPHA_VANTAGE_API_KEY` — required by `financial-analysis`
- `NEWS_API_KEY` — required by `news-summarizer`

`debt-tracker` needs no database credentials — it runs on a local SQLite file.

## Architecture Notes

- Each project is self-contained under `projects/<name>/` with its own README and stack (TBD per project)
- `shared/` holds cross-project utilities; keep it lean
- Python 3.11+ is the expected runtime (Node.js 20+ is an option per project if needed)
- `financial-analysis` will likely use `yfinance` or Alpha Vantage for market data

### Where each project stores data

The Supabase free tier allows **two** projects, and one of those is spoken for by another
workspace. That leaves exactly one, and it belongs to `hangout-organizer` — the only app here that
is actually deployed and therefore actually needs a hosted database.

| Project | Store |
|---|---|
| `debt-tracker` | **Local SQLite** — `data/debt-tracker.db`, receipts in `data/receipts/` |
| `reader-assistant` | Supabase today; **to be moved to local SQLite** so the slot can be freed |
| `hangout-organizer` | Its own Supabase project, RLS on, scoped to the host |

The rule this follows: a project that is local, single-user and never deployed does not need a
hosted Postgres. It was paying a network dependency, a project slot and free-tier auto-pause for
nothing. Deployment is what justifies Supabase — and the moment a project is deployed, RLS scoped
to a real identity becomes mandatory, not optional.

**Never put `hangout-organizer`'s tables in a project alongside another app's.** It ships an anon
key to every browser that opens a share link.

### API billing

A claude.ai Pro subscription does **not** cover Anthropic API usage — that is billed separately
against Console credits. `debt-tracker` uses Gemini's free tier for receipt parsing for this reason,
and `hangout-organizer` uses no LLM at all. Weigh this before adding an AI call to a deployed app,
where anyone with the link can spend those credits.
