"""One-shot export of the live Supabase data before debt-tracker moves to SQLite.

Run this while the Supabase project still exists. It writes one JSON file per
table plus the receipt images into data/supabase-export/, which import_export.py
then loads into the local SQLite database.

    py scripts/export_from_supabase.py
"""
from __future__ import annotations

import json
from pathlib import Path

from supabase import create_client

# Read the root .env directly. backend/config.py no longer carries Supabase
# settings — that is the whole point of this migration — so this script has to
# stand on its own.
ENV_FILE = Path(__file__).parent.parent.parent.parent / ".env"


def env(name: str) -> str:
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        key, _, value = line.partition("=")
        if key.strip().upper() == name:
            return value.strip().strip('"').strip("'")
    raise SystemExit(f"{name} not found in {ENV_FILE}")

TABLES = ["bills", "participants", "items", "item_assignments", "payments"]
BUCKET = "receipts"
OUT = Path(__file__).parent.parent / "data" / "supabase-export"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    db = create_client(env("SUPABASE_URL"), env("SUPABASE_SERVICE_KEY"))

    counts = {}
    for table in TABLES:
        rows = db.table(table).select("*").execute().data or []
        (OUT / f"{table}.json").write_text(
            json.dumps(rows, indent=2, default=str), encoding="utf-8"
        )
        counts[table] = len(rows)
        print(f"  {table:20} {len(rows):>4} rows")

    # Receipt images live in Storage, not in a table.
    images = OUT / "receipts"
    images.mkdir(exist_ok=True)
    saved = 0
    for bill in json.loads((OUT / "bills.json").read_text(encoding="utf-8")):
        path = bill.get("receipt_image_url")
        if not path:
            continue
        try:
            data = db.storage.from_(BUCKET).download(path)
        except Exception as exc:  # a missing object should not abort the export
            print(f"  ! could not download {path}: {exc}")
            continue
        dest = images / path.replace("/", "__")
        dest.write_bytes(data)
        saved += 1
    print(f"  {'receipt images':20} {saved:>4} files")

    (OUT / "manifest.json").write_text(
        json.dumps({"tables": counts, "images": saved}, indent=2), encoding="utf-8"
    )
    print(f"\nWrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
