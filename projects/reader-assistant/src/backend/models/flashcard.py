from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class TranslateRequest(BaseModel):
    text: str
    book_id: Optional[str] = None


class FlashcardOut(BaseModel):
    id: str
    book_id: Optional[str]
    source_text: str
    source_lang: str
    translated_text: str
    target_lang: str
    created_at: Optional[datetime]
