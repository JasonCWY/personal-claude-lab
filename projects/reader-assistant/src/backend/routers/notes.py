from __future__ import annotations

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from ..database import get_db
from ..models.note import NoteCreate, NoteOut

router = APIRouter()


@router.post("/books/{book_id}/notes", response_model=NoteOut)
def add_note(book_id: str, body: NoteCreate, db: Client = Depends(get_db)):
    if body.type not in ("note", "quote"):
        raise HTTPException(400, "type must be 'note' or 'quote'")
    row = db.table("notes").insert({
        "book_id": book_id,
        "type": body.type,
        "content": body.content,
        "location": body.location,
    }).execute().data[0]
    return NoteOut(**row)


@router.get("/books/{book_id}/notes", response_model=List[NoteOut])
def list_notes(book_id: str, db: Client = Depends(get_db)):
    rows = db.table("notes").select("*").eq("book_id", book_id).order("created_at").execute().data
    return [NoteOut(**r) for r in rows]


@router.delete("/books/{book_id}/notes/{note_id}")
def delete_note(book_id: str, note_id: str, db: Client = Depends(get_db)):
    db.table("notes").delete().eq("id", note_id).eq("book_id", book_id).execute()
    return {"status": "deleted"}
