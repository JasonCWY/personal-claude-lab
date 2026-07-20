import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch, MagicMock

from src.backend.services.book_metadata import fetch_metadata, is_fiction_from_categories


def test_is_fiction_from_categories_fiction():
    assert is_fiction_from_categories(["Fiction / Literary"]) is True


def test_is_fiction_from_categories_nonfiction():
    assert is_fiction_from_categories(["Business & Economics / Nonfiction"]) is False
    assert is_fiction_from_categories(["Non-Fiction / History"]) is False


def test_is_fiction_from_categories_other():
    assert is_fiction_from_categories(["Cooking"]) is False


def test_is_fiction_from_categories_empty():
    assert is_fiction_from_categories([]) is None


def _mock_response(payload):
    resp = MagicMock()
    resp.json.return_value = payload
    resp.raise_for_status.return_value = None
    return resp


def test_fetch_metadata_success():
    payload = {
        "items": [
            {
                "volumeInfo": {
                    "categories": ["Fiction / Fantasy"],
                    "language": "en",
                    "imageLinks": {"thumbnail": "http://example.com/cover.jpg"},
                }
            }
        ]
    }
    with patch("src.backend.services.book_metadata.httpx.get", return_value=_mock_response(payload)):
        meta = fetch_metadata("Some Title", "Some Author")

    assert meta.cover_url == "http://example.com/cover.jpg"
    assert meta.genre == "Fiction / Fantasy"
    assert meta.language == "en"
    assert meta.is_fiction is True


def test_fetch_metadata_no_results():
    with patch("src.backend.services.book_metadata.httpx.get", return_value=_mock_response({"items": []})):
        meta = fetch_metadata("Nonexistent Book")

    assert meta.cover_url is None
    assert meta.is_fiction is None
