from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import httpx

GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes"


@dataclass
class BookMetadata:
    cover_url: Optional[str]
    genre: Optional[str]
    language: Optional[str]
    is_fiction: Optional[bool]


def is_fiction_from_categories(categories: list[str]) -> Optional[bool]:
    """Pure heuristic: any category containing 'fiction' (but not 'nonfiction'/'non-fiction') marks it fiction."""
    if not categories:
        return None
    for cat in categories:
        lowered = cat.lower()
        if "nonfiction" in lowered or "non-fiction" in lowered:
            return False
        if "fiction" in lowered:
            return True
    return False


def fetch_metadata(title: str, author: Optional[str] = None) -> BookMetadata:
    query = f"intitle:{title}"
    if author:
        query += f"+inauthor:{author}"

    try:
        resp = httpx.get(GOOGLE_BOOKS_URL, params={"q": query, "maxResults": 1}, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError):
        return BookMetadata(cover_url=None, genre=None, language=None, is_fiction=None)

    items = data.get("items") or []
    if not items:
        return BookMetadata(cover_url=None, genre=None, language=None, is_fiction=None)

    info = items[0].get("volumeInfo", {})
    categories = info.get("categories") or []
    image_links = info.get("imageLinks") or {}

    return BookMetadata(
        cover_url=image_links.get("thumbnail"),
        genre=categories[0] if categories else None,
        language=info.get("language"),
        is_fiction=is_fiction_from_categories(categories),
    )
