from __future__ import annotations

import sqlite3
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException

from ..database import execute, get_db, money, new_id, query_all, query_one, to_money
from ..models.payment import PaymentCreate, PaymentOut
from ..services.calculator import (
    calculate, BillData, ItemData, AssignmentData, ParticipantData,
)

router = APIRouter()


@router.post("/bills/{bill_id}/payments", response_model=PaymentOut)
def mark_payment(bill_id: str, body: PaymentCreate, db: sqlite3.Connection = Depends(get_db)):
    if not query_one(db, "SELECT id FROM bills WHERE id = ?", (bill_id,)):
        raise HTTPException(404, "Bill not found")

    payment_id = new_id()
    execute(
        db,
        "INSERT INTO payments (id, bill_id, participant_id, amount, note)"
        " VALUES (?, ?, ?, ?, ?)",
        (payment_id, bill_id, body.participant_id, money(body.amount), body.note),
    )
    row = query_one(db, "SELECT * FROM payments WHERE id = ?", (payment_id,))

    _check_and_settle(db, bill_id)

    return PaymentOut(
        id=row["id"],
        participant_id=row["participant_id"],
        amount=to_money(row["amount"]),
        paid_at=str(row["paid_at"]),
        note=row.get("note"),
    )


@router.get("/bills/{bill_id}/summary")
def get_summary(bill_id: str, db: sqlite3.Connection = Depends(get_db)):
    """Return per-participant owed vs paid totals."""
    bill_row = query_one(db, "SELECT * FROM bills WHERE id = ?", (bill_id,))
    if not bill_row:
        raise HTTPException(404, "Bill not found")

    items = query_all(db, "SELECT * FROM items WHERE bill_id = ?", (bill_id,))
    participants = query_all(db, "SELECT * FROM participants WHERE bill_id = ?", (bill_id,))
    payments = query_all(db, "SELECT * FROM payments WHERE bill_id = ?", (bill_id,))

    # Every assignment on this bill, via the item it belongs to. The old
    # PostgREST version tried an embedded filter and a dead `db.rpc` branch to
    # express this; a join says it once.
    assignments = query_all(
        db,
        "SELECT a.* FROM item_assignments a"
        " JOIN items i ON i.id = a.item_id"
        " WHERE i.bill_id = ?",
        (bill_id,),
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
    participant_data = [
        ParticipantData(
            id=p["id"],
            is_birthday=bool(p["is_birthday"]),
            birthday_opt_in=bool(p["birthday_opt_in"]),
        )
        for p in participants
    ]

    result = calculate(bill_data, item_data, assignment_data, participant_data)

    paid_by_participant: dict = {}
    for pmt in payments:
        paid_by_participant[pmt["participant_id"]] = (
            paid_by_participant.get(pmt["participant_id"], Decimal("0"))
            + to_money(pmt["amount"])
        )

    summaries = []
    for p in participants:
        owed = result.participant_totals.get(p["id"], Decimal("0"))
        paid = paid_by_participant.get(p["id"], Decimal("0"))
        summaries.append({
            "id": p["id"],
            "display_name": p["display_name"],
            "is_birthday": bool(p["is_birthday"]),
            "has_selected": bool(p["has_selected"]),
            "amount_owed": float(owed),
            "amount_paid": float(paid),
            "balance": float(owed - paid),
        })

    actual_payer = None
    if bill_row["actual_payer_id"]:
        payer = next((p for p in participants if p["id"] == bill_row["actual_payer_id"]), None)
        if payer:
            actual_payer = {
                "id": payer["id"],
                "display_name": payer["display_name"],
                "creator_owes": float(result.creator_owes_payer),
            }

    return {
        "bill_id": bill_id,
        "status": bill_row["status"],
        "currency": bill_row["currency"],
        "unassigned_amount": float(result.unassigned_amount),
        "creator_owes_payer": actual_payer,
        "participants": summaries,
    }


def _check_and_settle(db: sqlite3.Connection, bill_id: str) -> None:
    summary = get_summary(bill_id, db)
    all_settled = all(s["balance"] <= 0 for s in summary["participants"])
    if all_settled and summary["status"] == "open":
        execute(db, "UPDATE bills SET status = 'settled' WHERE id = ?", (bill_id,))
