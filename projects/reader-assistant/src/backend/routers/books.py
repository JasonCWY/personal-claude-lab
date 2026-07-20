from __future__ import annotations

from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from ..database import get_db
from ..models.book import BookCreate, BookUpdate, BookFinish, BookOut
from ..services import book_metadata, summarizer

router = APIRouter()


def _fetch_book(db: Client, book_id: str) -> dict:
    row = db.table("books").select("*").eq("id", book_id).single().execute()
    if not row.data:
        raise HTTPException(404, "Book not found")
    return row.data


@router.post("/books", response_model=BookOut)
def create_book(body: BookCreate, db: Client = Depends(get_db)):
    meta = book_metadata.fetch_metadata(body.title, body.author)
    row = db.table("books").insert({
        "title": body.title,
        "author": body.author,
        "cover_url": meta.cover_url,
        "language": meta.language,
        "genre": meta.genre,
        "is_fiction": meta.is_fiction,
    }).execute().data[0]
    return BookOut(**row)


@router.get("/books", response_model=List[BookOut])
def list_books(db: Client = Depends(get_db)):
    rows = db.table("books").select("*").order("created_at", desc=True).execute().data
    return [BookOut(**r) for r in rows]


@router.get("/books/{book_id}", response_model=BookOut)
def get_book(book_id: str, db: Client = Depends(get_db)):
    return BookOut(**_fetch_book(db, book_id))


@router.patch("/books/{book_id}", response_model=BookOut)
def update_book(book_id: str, body: BookUpdate, db: Client = Depends(get_db)):
    _fetch_book(db, book_id)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        db.table("books").update(updates).eq("id", book_id).execute()
    return BookOut(**_fetch_book(db, book_id))


@router.post("/books/{book_id}/finish", response_model=BookOut)
def finish_book(book_id: str, body: BookFinish, db: Client = Depends(get_db)):
    book = _fetch_book(db, book_id)
    if not (1 <= body.rating <= 5):
        raise HTTPException(400, "Rating must be between 1 and 5")

    notes = db.table("notes").select("*").eq("book_id", book_id).order("created_at").execute().data
    summary = summarizer.summarize_book(book["title"], book["author"], notes)

    db.table("books").update({
        "status": "finished",
        "rating": body.rating,
        "summary": summary,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", book_id).execute()

    return BookOut(**_fetch_book(db, book_id))
