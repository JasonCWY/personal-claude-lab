from __future__ import annotations

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from ..database import get_db
from ..models.participant import ParticipantCreate, ParticipantOut

router = APIRouter()


@router.post("/bills/{bill_id}/participants", response_model=ParticipantOut)
def add_participant(bill_id: str, body: ParticipantCreate, db: Client = Depends(get_db)):
    bill = db.table("bills").select("id,status").eq("id", bill_id).single().execute()
    if not bill.data:
        raise HTTPException(404, "Bill not found")
    if bill.data["status"] != "draft":
        raise HTTPException(400, "Cannot add participants after the bill is shared")

    row = db.table("participants").insert({
        "bill_id": bill_id,
        "display_name": body.display_name,
        "is_birthday": body.is_birthday,
    }).execute().data[0]

    return ParticipantOut(
        id=row["id"],
        display_name=row["display_name"],
        invite_token=row["invite_token"],
        is_birthday=row["is_birthday"],
        birthday_opt_in=row["birthday_opt_in"],
        has_selected=row["has_selected"],
    )


@router.get("/bills/{bill_id}/participants", response_model=List[ParticipantOut])
def list_participants(bill_id: str, db: Client = Depends(get_db)):
    rows = db.table("participants").select("*").eq("bill_id", bill_id).execute().data
    return [
        ParticipantOut(
            id=r["id"],
            display_name=r["display_name"],
            invite_token=r["invite_token"],
            is_birthday=r["is_birthday"],
            birthday_opt_in=r["birthday_opt_in"],
            has_selected=r["has_selected"],
        )
        for r in rows
    ]


@router.delete("/bills/{bill_id}/participants/{participant_id}", status_code=204)
def remove_participant(bill_id: str, participant_id: str, db: Client = Depends(get_db)):
    bill = db.table("bills").select("status").eq("id", bill_id).single().execute()
    if not bill.data:
        raise HTTPException(404, "Bill not found")
    if bill.data["status"] != "draft":
        raise HTTPException(400, "Cannot remove participants after the bill is shared")
    db.table("participants").delete().eq("id", participant_id).eq("bill_id", bill_id).execute()
