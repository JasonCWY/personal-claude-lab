from __future__ import annotations

import base64
import json
from google import genai
from google.genai import types

from ..config import settings
from ..models.bill import ParsedReceipt

PROMPT = """Parse this receipt image and return a JSON object with exactly this structure:
{
  "currency": "SGD",
  "items": [
    {"name": "Item name", "unit_price": 10.00, "quantity": 1}
  ],
  "subtotal": 10.00,
  "tax": 0.80,
  "service_charge": 1.00,
  "total": 11.80,
  "notes": "any warnings or ambiguities"
}

Rules:
- Separate quantity and unit_price into distinct fields; do not combine them
- If a percentage surcharge is shown (e.g. 10% service charge), calculate its numeric value
- If a line is unreadable, include it as {"name": "unreadable", "quantity": 1} with no unit_price
- Use null for any numeric field you cannot determine
- Return only the JSON object — no prose, no markdown"""


def parse_receipt(image_base64: str, media_type: str = "image/jpeg") -> ParsedReceipt:
    client = genai.Client(api_key=settings.gemini_api_key)
    image_bytes = base64.b64decode(image_base64)

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=media_type),
            PROMPT,
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )

    try:
        data = json.loads(response.text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini returned non-JSON response: {response.text[:200]}") from exc

    return ParsedReceipt(**data)
