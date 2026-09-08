"""Receipt images on the local filesystem.

These used to live in a Supabase Storage bucket. For a single-user app running
on one machine, a folder does the same job with no network and no credentials —
this got simpler when the app left Supabase, not harder.

Paths are stored in bills.receipt_image_url exactly as before ("<bill_id>/original.jpg"),
so existing rows keep working; only the resolution of that path changed.
"""
from __future__ import annotations

import base64
from pathlib import Path

RECEIPTS_DIR = Path(__file__).parent.parent.parent.parent / "data" / "receipts"


def _resolve(path: str) -> Path:
    """Map a stored path to a file, refusing anything that escapes the folder."""
    full = (RECEIPTS_DIR / path).resolve()
    if not full.is_relative_to(RECEIPTS_DIR.resolve()):
        raise ValueError(f"Refusing to resolve {path!r} outside the receipts folder")
    return full


def upload_receipt(bill_id: str, file_bytes: bytes, content_type: str) -> str:
    path = f"{bill_id}/original.jpg"
    dest = _resolve(path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(file_bytes)
    return path


def read_receipt_as_base64(path: str) -> tuple[str, str]:
    """Returns (base64_data, media_type) for passing to the receipt parser."""
    data = _resolve(path).read_bytes()
    return base64.standard_b64encode(data).decode("utf-8"), "image/jpeg"
