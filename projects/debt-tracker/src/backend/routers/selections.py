from __future__ import annotations

from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from ..database import get_db
from ..models.bill import BillOut, ItemOut
from ..models.participant import ParticipantOut, SelectionSubmit
from ..services.calculator import (
    calculate, BillData, ItemData, AssignmentData, ParticipantData,
)

router = APIRouter()


def _participant_by_token(db: Client, bill_id: str, token: str) -> dict:
    row = (
        db.table("participants")
        .select("*")
        .eq("bill_id", bill_id)
        .eq("invite_token", token)
        .single()
        .execute()
    )
    if not row.data:
        raise HTTPException(404, "Invalid invite link")
    return row.data


@router.get("/bills/{bill_id}/join/{token}")
def join_bill(bill_id: str, token: str, db: Client = Depends(get_db)):
    """Validate participant token and return bill data for the selection UI."""
    participant = _participant_by_token(db, bill_id, token)
    bill_row = db.table("bills").select("*").eq("id", bill_id).single().execute().data
    if not bill_row or bill_row["status"] == "draft":
        raise HTTPException(403, "This bill is not open yet")

    items = db.table("items").select("*").eq("bill_id", bill_id).order("sort_order").execute().data
    all_participants = db.table("participants").select("id,display_name,is_birthday").eq("bill_id", bill_id).execute().data

    # Fetch existing assignments for this participant so UI can pre-populate
    existing = (
        db.table("item_assignments")
        .select("item_id,share_numerator,share_denominator")
        .eq("participant_id", participant["id"])
        .execute()
        .data
    )

    return {
        "bill": {
            "id": bill_row["id"],
            "title": bill_row["title"],
            "currency": bill_row["currency"],
            "subtotal": bill_row["subtotal"],
            "tax": bill_row["tax"],
            "service_charge": bill_row["service_charge"],
            "total": bill_row["total"],
            "has_birthday_person": any(p["is_birthday"] for p in all_participants),
        },
        "participant": {
            "id": participant["id"],
            "display_name": participant["display_name"],
            "is_birthday": participant["is_birthday"],
            "birthday_opt_in": participant["birthday_opt_in"],
            "has_selected": participant["has_selected"],
        },
        "items": items,
        "all_participants": all_participants,
        "existing_assignments": existing,
    }


@router.post("/bills/{bill_id}/join/{token}/selections")
def submit_selections(
    bill_id: str,
    token: str,
    body: SelectionSubmit,
    db: Client = Depends(get_db),
):
    participant = _participant_by_token(db, bill_id, token)
    pid = participant["id"]

    # Clear any existing assignments for this participant
    existing_assignment_ids = (
        db.table("item_assignments").select("id").eq("participant_id", pid).execute().data
    )
    if existing_assignment_ids:
        db.table("item_assignments").delete().eq("participant_id", pid).execute()

    rows_to_insert = []
    for sel in body.assignments:
        others = sel.sharing_with
        all_sharers = [pid] + others
        denominator = len(all_sharers)

        # Check for conflicts: item claimed as individual by someone else
        if denominator == 1:
            conflict = (
                db.table("item_assignments")
                .select("participant_id")
                .eq("item_id", sel.item_id)
                .eq("share_denominator", 1)
                .execute()
                .data
            )
            if conflict and conflict[0]["participant_id"] != pid:
                raise HTTPException(
                    409,
                    f"Item {sel.item_id} is already claimed individually. Share it instead.",
                )

        for sharer_id in all_sharers:
            rows_to_insert.append({
                "item_id": sel.item_id,
                "participant_id": sharer_id,
                "share_numerator": 1,
                "share_denominator": denominator,
            })

    if rows_to_insert:
        db.table("item_assignments").upsert(rows_to_insert, on_conflict="item_id,participant_id").execute()

    # Update birthday opt-in
    db.table("participants").update({
        "birthday_opt_in": body.birthday_opt_in,
        "has_selected": True,
    }).eq("id", pid).execute()

    # Return updated totals for this participant
    return _get_participant_total(db, bill_id, pid)


def _get_participant_total(db: Client, bill_id: str, participant_id: str) -> dict:
    bill_row = db.table("bills").select("*").eq("id", bill_id).single().execute().data
    items = db.table("items").select("*").eq("bill_id", bill_id).execute().data
    assignments = db.table("item_assignments").select("*").eq("participant_id", participant_id).execute().data
    participant_row = db.table("participants").select("*").eq("id", participant_id).single().execute().data

    bill_data = BillData(
        subtotal=Decimal(str(bill_row["subtotal"] or 0)),
        tax=Decimal(str(bill_row["tax"] or 0)),
        service_charge=Decimal(str(bill_row["service_charge"] or 0)),
        actual_payer_id=bill_row["actual_payer_id"],
    )
    item_data = [ItemData(id=i["id"], total_price=Decimal(str(i["total_price"]))) for i in items]
    assignment_data = [
        AssignmentData(
            item_id=a["item_id"],
            participant_id=a["participant_id"],
            share_numerator=a["share_numerator"],
            share_denominator=a["share_denominator"],
        )
        for a in assignments
    ]
    participants_data = [
        ParticipantData(
            id=participant_row["id"],
            is_birthday=participant_row["is_birthday"],
            birthday_opt_in=participant_row["birthday_opt_in"],
        )
    ]

    result = calculate(bill_data, item_data, assignment_data, participants_data)
    amount = result.participant_totals.get(participant_id, Decimal("0"))
    return {"your_total": float(amount), "currency": bill_row["currency"]}
