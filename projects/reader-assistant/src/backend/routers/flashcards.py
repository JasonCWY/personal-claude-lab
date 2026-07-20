from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends
from supabase import Client

from ..database import get_db
from ..models.flashcard import TranslateRequest, FlashcardOut
from ..services import translator

router = APIRouter()


@router.post("/translate", response_model=FlashcardOut)
def translate_and_save(body: TranslateRequest, db: Client = Depends(get_db)):
    result = translator.translate(body.text)
    row = db.table("flashcards").insert({
        "book_id": body.book_id,
        "source_text": result.source_text,
        "source_lang": result.source_lang,
        "translated_text": result.translated_text,
        "target_lang": result.target_lang,
    }).execute().data[0]
    return FlashcardOut(**row)


@router.get("/flashcards", response_model=List[FlashcardOut])
def list_flashcards(book_id: Optional[str] = None, db: Client = Depends(get_db)):
    query = db.table("flashcards").select("*")
    if book_id:
        query = query.eq("book_id", book_id)
    rows = query.order("created_at", desc=True).execute().data
    return [FlashcardOut(**r) for r in rows]


@router.delete("/flashcards/{flashcard_id}")
def delete_flashcard(flashcard_id: str, db: Client = Depends(get_db)):
    db.table("flashcards").delete().eq("id", flashcard_id).execute()
    return {"status": "deleted"}
