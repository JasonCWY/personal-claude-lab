from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class NoteCreate(BaseModel):
    type: str  # 'note' | 'quote'
    content: str
    location: Optional[str] = None


class NoteOut(BaseModel):
    id: str
    book_id: str
    type: str
    content: str
    location: Optional[str]
    created_at: Optional[datetime]
