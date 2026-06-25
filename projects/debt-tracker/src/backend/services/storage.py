from __future__ import annotations

import base64
from io import BytesIO
from supabase import Client

BUCKET = "receipts"


def upload_receipt(db: Client, bill_id: str, file_bytes: bytes, content_type: str) -> str:
    path = f"{bill_id}/original.jpg"
    db.storage.from_(BUCKET).upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return path


def read_receipt_as_base64(db: Client, path: str) -> tuple[str, str]:
    """Returns (base64_data, media_type) for passing to Claude."""
    data = db.storage.from_(BUCKET).download(path)
    encoded = base64.standard_b64encode(data).decode("utf-8")
    return encoded, "image/jpeg"
