from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ChatMessageCreate(BaseModel):
    content: str


class ChatMessageOut(BaseModel):
    id: str
    book_id: str
    role: str
    content: str
    created_at: Optional[datetime]
