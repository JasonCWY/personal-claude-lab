from __future__ import annotations

import sys
from pathlib import Path
from typing import List, Optional

_REPO_ROOT = Path(__file__).resolve().parents[5]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from shared.claude_client import get_client

MODEL = "claude-sonnet-5"


def summarize_book(title: str, author: Optional[str], notes: List[dict]) -> str:
    """Generate a summary grounded on the user's captured notes/quotes.

    This is the only content the app has about the book (no full-text
    ingestion), so the summary reflects what the user chose to capture,
    not the whole book.
    """
    notes_text = "\n".join(
        f"- [{n['type']}] {n['content']}" + (f" ({n['location']})" if n.get("location") else "")
        for n in notes
    ) or "(no notes or quotes were captured for this book)"

    by_line = f" by {author}" if author else ""
    prompt = (
        f"The user just finished reading \"{title}\"{by_line}. "
        f"Below are the notes and quotes they captured while reading:\n\n{notes_text}\n\n"
        "Write a concise summary (3-5 sentences) of the book's key ideas and themes, "
        "grounded in these notes. If the notes are sparse, acknowledge that briefly "
        "rather than inventing details about the book you don't have evidence for."
    )

    client = get_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()
