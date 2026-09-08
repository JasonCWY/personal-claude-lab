from __future__ import annotations

import sqlite3
from typing import List
from fastapi import APIRouter, Depends, HTTPException

from ..database import execute, get_db, new_id, query_all, query_one
from ..models.participant import ParticipantCreate, ParticipantOut

router = APIRouter()


def _participant_out(r: dict) -> ParticipantOut:
    return ParticipantOut(
        id=r["id"],
        display_name=r["display_name"],
        invite_token=r["invite_token"],
        is_birthday=bool(r["is_birthday"]),
        birthday_opt_in=bool(r["birthday_opt_in"]),
        has_selected=bool(r["has_selected"]),
    )


@router.post("/bills/{bill_id}/participants", response_model=ParticipantOut)
def add_participant(
    bill_id: str, body: ParticipantCreate, db: sqlite3.Connection = Depends(get_db)
):
    bill = query_one(db, "SELECT id, status FROM bills WHERE id = ?", (bill_id,))
    if not bill:
        raise HTTPException(404, "Bill not found")
    if bill["status"] != "draft":
        raise HTTPException(400, "Cannot add participants after the bill is shared")

    participant_id = new_id()
    execute(
        db,
        "INSERT INTO participants (id, bill_id, display_name, invite_token, is_birthday)"
        " VALUES (?, ?, ?, ?, ?)",
        (participant_id, bill_id, body.display_name, new_id(), int(body.is_birthday)),
    )
    return _participant_out(
        query_one(db, "SELECT * FROM participants WHERE id = ?", (participant_id,))
    )


@router.get("/bills/{bill_id}/participants", response_model=List[ParticipantOut])
def list_participants(bill_id: str, db: sqlite3.Connection = Depends(get_db)):
    rows = query_all(
        db, "SELECT * FROM participants WHERE bill_id = ? ORDER BY created_at", (bill_id,)
    )
    return [_participant_out(r) for r in rows]


@router.delete("/bills/{bill_id}/participants/{participant_id}", status_code=204)
def remove_participant(
    bill_id: str, participant_id: str, db: sqlite3.Connection = Depends(get_db)
):
    bill = query_one(db, "SELECT status FROM bills WHERE id = ?", (bill_id,))
    if not bill:
        raise HTTPException(404, "Bill not found")
    if bill["status"] != "draft":
        raise HTTPException(400, "Cannot remove participants after the bill is shared")
    execute(
        db,
        "DELETE FROM participants WHERE id = ? AND bill_id = ?",
        (participant_id, bill_id),
    )
