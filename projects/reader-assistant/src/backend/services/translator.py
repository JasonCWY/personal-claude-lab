from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[5]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from shared.claude_client import get_client

_CJK_RE = re.compile(r"[一-鿿㐀-䶿]")

MODEL = "claude-sonnet-5"


@dataclass
class Translation:
    source_text: str
    source_lang: str
    translated_text: str
    target_lang: str


def detect_lang(text: str) -> str:
    """Pure function: any CJK character means Chinese, otherwise English."""
    return "zh" if _CJK_RE.search(text) else "en"


def translate(text: str) -> Translation:
    source_lang = detect_lang(text)
    target_lang = "en" if source_lang == "zh" else "zh"
    target_name = "English" if target_lang == "en" else "Chinese"

    client = get_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=300,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Translate the following word or phrase into {target_name}. "
                    f"Reply with only the translation, no explanation, no quotes:\n\n{text}"
                ),
            }
        ],
    )
    translated_text = response.content[0].text.strip()

    return Translation(
        source_text=text,
        source_lang=source_lang,
        translated_text=translated_text,
        target_lang=target_lang,
    )
