import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import json
from unittest.mock import MagicMock, patch
from decimal import Decimal
from src.backend.models.bill import ParsedReceipt


def _make_gemini_response(data: dict):
    response = MagicMock()
    response.text = json.dumps(data)
    return response


@patch("src.backend.services.receipt_parser.genai.Client")
def test_parse_basic_receipt(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_client.models.generate_content.return_value = _make_gemini_response({
        "currency": "SGD",
        "items": [
            {"name": "Grilled Salmon", "unit_price": 28.0, "quantity": 1},
            {"name": "Miso Soup", "unit_price": 5.0, "quantity": 2},
        ],
        "subtotal": 38.0,
        "tax": 1.52,
        "service_charge": 3.80,
        "total": 43.32,
        "notes": "",
    })

    from src.backend.services.receipt_parser import parse_receipt
    result = parse_receipt("ZmFrZQ==", "image/jpeg")

    assert isinstance(result, ParsedReceipt)
    assert result.currency == "SGD"
    assert len(result.items) == 2
    assert result.items[0].name == "Grilled Salmon"
    assert result.items[0].unit_price == Decimal("28.0")
    assert result.items[1].quantity == 2
    assert result.subtotal == Decimal("38.0")
    assert result.total == Decimal("43.32")


@patch("src.backend.services.receipt_parser.genai.Client")
def test_parse_with_null_fields(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_client.models.generate_content.return_value = _make_gemini_response({
        "currency": "MYR",
        "items": [
            {"name": "unreadable", "unit_price": None, "quantity": 1},
            {"name": "Nasi Lemak", "unit_price": 12.0, "quantity": 1},
        ],
        "subtotal": None,
        "tax": None,
        "service_charge": None,
        "total": None,
        "notes": "Line 1 was unclear",
    })

    from src.backend.services.receipt_parser import parse_receipt
    result = parse_receipt("ZmFrZQ==")

    assert result.currency == "MYR"
    assert result.items[0].unit_price is None
    assert result.subtotal is None


@patch("src.backend.services.receipt_parser.genai.Client")
def test_parse_raises_on_invalid_json(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_client.models.generate_content.return_value = MagicMock(
        text="Sorry, I cannot read this image."
    )

    from src.backend.services.receipt_parser import parse_receipt
    try:
        parse_receipt("ZmFrZQ==")
        assert False, "Expected ValueError"
    except ValueError:
        pass
