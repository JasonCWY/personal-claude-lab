from __future__ import annotations

import sys
from pathlib import Path
from typing import List, Optional

_REPO_ROOT = Path(__file__).resolve().parents[5]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from shared.claude_client import get_client

MODEL = "claude-sonnet-5"


def reply(title: str, author: Optional[str], history: List[dict], user_message: str) -> str:
    """Open-ended discussion partner for a specific non-fiction book.

    Deliberately not grounded on the user's captured notes/quotes -- this is
    a free-form chat for exchanging ideas, not a Q&A over logged content.
    """
    by_line = f" by {author}" if author else ""
    system = (
        f"You are discussing the non-fiction book \"{title}\"{by_line} with the reader. "
        "Engage with their ideas and questions about the book's arguments, themes, and "
        "implications like a thoughtful reading companion. Keep replies conversational "
        "and not overly long."
    )

    messages = [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": user_message})

    client = get_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=600,
        system=system,
        messages=messages,
    )
    return response.content[0].text.strip()
