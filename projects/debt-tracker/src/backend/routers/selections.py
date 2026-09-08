from __future__ import annotations

import sqlite3
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException

from ..database import execute, get_db, new_id, query_all, query_one, to_money
from ..models.participant import SelectionSubmit
from ..services.calculator import (
    calculate, BillData, ItemData, AssignmentData, ParticipantData,
)

router = APIRouter()


def _participant_by_token(db: sqlite3.Connection, bill_id: str, token: str) -> dict:
    row = query_one(
        db,
        "SELECT * FROM participants WHERE bill_id = ? AND invite_token = ?",
        (bill_id, token),
    )
    if not row:
        raise HTTPException(404, "Invalid invite link")
    return row


@router.get("/bills/{bill_id}/join/{token}")
def join_bill(bill_id: str, token: str, db: sqlite3.Connection = Depends(get_db)):
    """Validate participant token and return bill data for the selection UI."""
    participant = _participant_by_token(db, bill_id, token)
    bill_row = query_one(db, "SELECT * FROM bills WHERE id = ?", (bill_id,))
    if not bill_row or bill_row["status"] == "draft":
        raise HTTPException(403, "This bill is not open yet")

    items = query_all(
        db, "SELECT * FROM items WHERE bill_id = ? ORDER BY sort_order", (bill_id,)
    )
    all_participants = [
        {"id": p["id"], "display_name": p["display_name"], "is_birthday": bool(p["is_birthday"])}
        for p in query_all(
            db,
            "SELECT id, display_name, is_birthday FROM participants WHERE bill_id = ?"
            " ORDER BY created_at",
            (bill_id,),
        )
    ]

    existing = query_all(
        db,
        "SELECT item_id, share_numerator, share_denominator FROM item_assignments"
        " WHERE participant_id = ?",
        (participant["id"],),
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
            "is_birthday": bool(participant["is_birthday"]),
            "birthday_opt_in": bool(participant["birthday_opt_in"]),
            "has_selected": bool(participant["has_selected"]),
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
    db: sqlite3.Connection = Depends(get_db),
):
    participant = _participant_by_token(db, bill_id, token)
    pid = participant["id"]

    # This submission is the participant's complete answer, so clear what they
    # said last time rather than merging into it.
    execute(db, "DELETE FROM item_assignments WHERE participant_id = ?", (pid,))

    rows_to_insert = []
    for sel in body.assignments:
        all_sharers = [pid] + sel.sharing_with
        denominator = len(all_sharers)

        # An item someone else has claimed outright cannot also be claimed here.
        if denominator == 1:
            conflict = query_all(
                db,
                "SELECT participant_id FROM item_assignments"
                " WHERE item_id = ? AND share_denominator = 1",
                (sel.item_id,),
            )
            if conflict and conflict[0]["participant_id"] != pid:
                raise HTTPException(
                    409,
                    f"Item {sel.item_id} is already claimed individually. Share it instead.",
                )

        for sharer_id in all_sharers:
            rows_to_insert.append(
                (new_id(), sel.item_id, sharer_id, 1, denominator)
            )

    if rows_to_insert:
        # A co-sharer may already have a row for this item from their own
        # submission; the newer split wins.
        db.executemany(
            "INSERT INTO item_assignments"
            " (id, item_id, participant_id, share_numerator, share_denominator)"
            " VALUES (?, ?, ?, ?, ?)"
            " ON CONFLICT (item_id, participant_id) DO UPDATE SET"
            " share_numerator = excluded.share_numerator,"
            " share_denominator = excluded.share_denominator",
            rows_to_insert,
        )
        db.commit()

    execute(
        db,
        "UPDATE participants SET birthday_opt_in = ?, has_selected = 1 WHERE id = ?",
        (int(body.birthday_opt_in), pid),
    )

    return _get_participant_total(db, bill_id, pid)


def _get_participant_total(db: sqlite3.Connection, bill_id: str, participant_id: str) -> dict:
    bill_row = query_one(db, "SELECT * FROM bills WHERE id = ?", (bill_id,))
    items = query_all(db, "SELECT * FROM items WHERE bill_id = ?", (bill_id,))
    assignments = query_all(
        db, "SELECT * FROM item_assignments WHERE participant_id = ?", (participant_id,)
    )
    participant_row = query_one(
        db, "SELECT * FROM participants WHERE id = ?", (participant_id,)
    )

    bill_data = BillData(
        subtotal=to_money(bill_row["subtotal"]),
        tax=to_money(bill_row["tax"]),
        service_charge=to_money(bill_row["service_charge"]),
        actual_payer_id=bill_row["actual_payer_id"],
    )
    item_data = [ItemData(id=i["id"], total_price=to_money(i["total_price"])) for i in items]
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
            is_birthday=bool(participant_row["is_birthday"]),
            birthday_opt_in=bool(participant_row["birthday_opt_in"]),
        )
    ]

    result = calculate(bill_data, item_data, assignment_data, participants_data)
    amount = result.participant_totals.get(participant_id, Decimal("0"))
    return {"your_total": float(amount), "currency": bill_row["currency"]}
