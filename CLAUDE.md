# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo Overview

Personal workspace for building AI projects powered by the Claude API. All three projects under `projects/` are currently in the planning/scaffold stage with no implementation yet.

## Projects

| Project | Purpose |
|---|---|
| `projects/debt-tracker` | Natural-language debt tracking with payoff projections |
| `projects/financial-analysis` | Earnings reports, SEC filings, portfolio commentary via Claude |
| `projects/news-summarizer` | Daily news digest → summaries, flashcards, Q&A output |

## Shared Utilities

`shared/claude_client.py` — thin wrapper that returns an `anthropic.Anthropic` client using `ANTHROPIC_API_KEY` from the environment. All projects should import from here rather than instantiate their own clients.

## Environment

Copy `.env.example` to `.env` and fill in keys before running any project:
- `ANTHROPIC_API_KEY` — required by all projects
- `ALPHA_VANTAGE_API_KEY` — required by `financial-analysis`
- `NEWS_API_KEY` — required by `news-summarizer`

## Architecture Notes

- Each project is self-contained under `projects/<name>/` with its own README and stack (TBD per project)
- `shared/` holds cross-project utilities; keep it lean
- Python 3.11+ is the expected runtime (Node.js 20+ is an option per project if needed)
- `financial-analysis` will likely use `yfinance` or Alpha Vantage for market data
