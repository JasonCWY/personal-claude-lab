"""Load the Supabase export into the local SQLite database.

Run export_from_supabase.py first. Safe to re-run: rows are inserted by primary
key with INSERT OR REPLACE, so a second pass overwrites rather than duplicates.

    py scripts/import_to_sqlite.py
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from backend.database import DB_PATH, get_db  # noqa: E402
from backend.services.storage import RECEIPTS_DIR  # noqa: E402

EXPORT = Path(__file__).parent.parent / "data" / "supabase-export"

# Insertion order matters: children after the rows they reference.
# actual_payer_id on bills points at participants, so that one is patched last.
TABLES = {
    "bills": ["id", "title", "receipt_image_url", "currency", "subtotal", "tax",
              "service_charge", "total", "status", "created_at"],
    "participants": ["id", "bill_id", "display_name", "invite_token", "is_birthday",
                     "birthday_opt_in", "has_selected", "created_at"],
    "items": ["id", "bill_id", "name", "unit_price", "quantity", "sort_order"],
    "item_assignments": ["id", "item_id", "participant_id", "share_numerator",
                         "share_denominator"],
    "payments": ["id", "bill_id", "participant_id", "amount", "paid_at", "note"],
}
BOOLEAN_COLUMNS = {"is_birthday", "birthday_opt_in", "has_selected"}


def main() -> int:
    if not EXPORT.exists():
        raise SystemExit(f"No export at {EXPORT}. Run export_from_supabase.py first.")

    db = get_db()
    for table, columns in TABLES.items():
        source = EXPORT / f"{table}.json"
        rows = json.loads(source.read_text(encoding="utf-8")) if source.exists() else []
        if not rows:
            print(f"  {table:20}    0 rows")
            continue
        values = [
            tuple(
                int(bool(r.get(c))) if c in BOOLEAN_COLUMNS else r.get(c)
                for c in columns
            )
            for r in rows
        ]
        placeholders = ", ".join("?" for _ in columns)
        db.executemany(
            f"INSERT OR REPLACE INTO {table} ({', '.join(columns)})"
            f" VALUES ({placeholders})",
            values,
        )
        db.commit()
        print(f"  {table:20} {len(rows):>4} rows")

    # actual_payer_id is deferred: it points at participants, which land after bills.
    bills = json.loads((EXPORT / "bills.json").read_text(encoding="utf-8"))
    payers = [(b["actual_payer_id"], b["id"]) for b in bills if b.get("actual_payer_id")]
    if payers:
        db.executemany("UPDATE bills SET actual_payer_id = ? WHERE id = ?", payers)
        db.commit()
        print(f"  {'actual_payer links':20} {len(payers):>4} set")

    # Receipt images were flattened to one folder on export; restore the layout
    # bills.receipt_image_url expects.
    saved = 0
    for image in sorted((EXPORT / "receipts").glob("*")):
        if not image.is_file():
            continue
        dest = RECEIPTS_DIR / image.name.replace("__", "/")
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(image, dest)
        saved += 1
    print(f"  {'receipt images':20} {saved:>4} files")

    print(f"\nLoaded into {DB_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
