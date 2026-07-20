from __future__ import annotations

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from ..database import get_db
from ..models.chat import ChatMessageCreate, ChatMessageOut
from ..services import chat_service

router = APIRouter()


def _fetch_book(db: Client, book_id: str) -> dict:
    row = db.table("books").select("*").eq("id", book_id).single().execute()
    if not row.data:
        raise HTTPException(404, "Book not found")
    return row.data


@router.get("/books/{book_id}/chat", response_model=List[ChatMessageOut])
def get_chat_history(book_id: str, db: Client = Depends(get_db)):
    rows = db.table("chat_messages").select("*").eq("book_id", book_id).order("created_at").execute().data
    return [ChatMessageOut(**r) for r in rows]


@router.post("/books/{book_id}/chat", response_model=ChatMessageOut)
def send_chat_message(book_id: str, body: ChatMessageCreate, db: Client = Depends(get_db)):
    book = _fetch_book(db, book_id)
    if book.get("is_fiction") is not False:
        raise HTTPException(400, "Chat is only available for non-fiction books")

    history = db.table("chat_messages").select("*").eq("book_id", book_id).order("created_at").execute().data

    db.table("chat_messages").insert({
        "book_id": book_id,
        "role": "user",
        "content": body.content,
    }).execute()

    reply_text = chat_service.reply(book["title"], book["author"], history, body.content)

    row = db.table("chat_messages").insert({
        "book_id": book_id,
        "role": "assistant",
        "content": reply_text,
    }).execute().data[0]

    return ChatMessageOut(**row)
