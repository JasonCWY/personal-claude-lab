"""SQLite connection handling and the three query helpers the routers use.

Why SQLite: this app is local, single-user and never deployed, so a hosted
Postgres bought it nothing but a network dependency and a Supabase free-tier
project slot that hangout-organizer needed. See CLAUDE.md § Why SQLite.

Rows come back as dicts, matching what the routers expect and keeping the
`row["column"]` access they already use.
"""
from __future__ import annotations

import sqlite3
import uuid
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable, Sequence

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DB_PATH = DATA_DIR / "debt-tracker.db"
SCHEMA_PATH = Path(__file__).parent.parent.parent / "migrations" / "001_initial_schema.sql"

_conn: sqlite3.Connection | None = None


def new_id() -> str:
    """SQLite has no gen_random_uuid(); ids are minted here instead."""
    return str(uuid.uuid4())


MONEY = Decimal("0.01")


def money(value: Any) -> float:
    """Round to 2dp on the way in, which is what NUMERIC(10,2) used to do."""
    return round(float(value), 2)


def to_money(value: Any) -> Decimal:
    """Money on the way out.

    SQLite hands back a float, so Decimal(str(37.0)) is Decimal('37.0') and the
    API would answer "37.0" where the Postgres NUMERIC(10,2) column answered
    "37.00". Quantizing here keeps the response shape identical and absorbs the
    float artefacts (0.1 + 0.2) that REAL storage can otherwise surface.
    """
    return Decimal(str(value or 0)).quantize(MONEY)


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Off by default in SQLite, and this schema leans on ON DELETE CASCADE.
    conn.execute("PRAGMA foreign_keys = ON")
    # WAL keeps the API responsive while the frontend polls.
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    return conn


def get_db() -> sqlite3.Connection:
    """FastAPI dependency. One connection for the process; SQLite serialises."""
    global _conn
    if _conn is None:
        _conn = _connect()
    return _conn


def query_all(db: sqlite3.Connection, sql: str, params: Sequence[Any] = ()) -> list[dict]:
    return [dict(r) for r in db.execute(sql, params).fetchall()]


def query_one(db: sqlite3.Connection, sql: str, params: Sequence[Any] = ()) -> dict | None:
    row = db.execute(sql, params).fetchone()
    return dict(row) if row else None


def execute(db: sqlite3.Connection, sql: str, params: Sequence[Any] = ()) -> int:
    """Run a write and commit. Returns the number of rows affected."""
    cur = db.execute(sql, params)
    db.commit()
    return cur.rowcount


def execute_many(db: sqlite3.Connection, sql: str, rows: Iterable[Sequence[Any]]) -> None:
    db.executemany(sql, rows)
    db.commit()
