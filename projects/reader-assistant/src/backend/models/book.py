from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class BookCreate(BaseModel):
    title: str
    author: Optional[str] = None


class BookUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    status: Optional[str] = None


class BookFinish(BaseModel):
    rating: int  # 1-5


class BookOut(BaseModel):
    id: str
    title: str
    author: Optional[str]
    cover_url: Optional[str]
    language: Optional[str]
    genre: Optional[str]
    is_fiction: Optional[bool]
    status: str
    rating: Optional[int]
    summary: Optional[str]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    created_at: Optional[datetime]
