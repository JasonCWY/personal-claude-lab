# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo Overview

Personal workspace for building AI projects powered by the Claude API. `debt-tracker`, `reader-assistant` and `hangout-organizer` are built; `financial-analysis` and `news-summarizer` are still at the planning/scaffold stage.

## Projects

| Project | Purpose |
|---|---|
| `projects/debt-tracker` | Natural-language debt tracking with payoff projections |
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
- `ANTHROPIC_API_KEY` — required by all projects
- `ALPHA_VANTAGE_API_KEY` — required by `financial-analysis`
- `NEWS_API_KEY` — required by `news-summarizer`

## Architecture Notes

- Each project is self-contained under `projects/<name>/` with its own README and stack (TBD per project)
- `shared/` holds cross-project utilities; keep it lean
- Python 3.11+ is the expected runtime (Node.js 20+ is an option per project if needed)
- `financial-analysis` will likely use `yfinance` or Alpha Vantage for market data

### Supabase projects

`debt-tracker` and `reader-assistant` share one Supabase project and run with RLS **off** — they
are local, single-user apps whose keys never leave the machine.

`hangout-organizer` must use a **separate** Supabase project. It is deployed publicly and ships an
anon key to the browser; putting its tables alongside the other two would expose their data. Do not
run its migration into the shared project.

### API billing

A claude.ai Pro subscription does **not** cover Anthropic API usage — that is billed separately
against Console credits. `debt-tracker` uses Gemini's free tier for receipt parsing for this reason,
and `hangout-organizer` uses no LLM at all. Weigh this before adding an AI call to a deployed app,
where anyone with the link can spend those credits.
