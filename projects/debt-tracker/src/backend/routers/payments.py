from __future__ import annotations

from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from ..database import get_db
from ..models.payment import PaymentCreate, PaymentOut
from ..models.participant import ParticipantSummary, ParticipantOut
from ..services.calculator import (
    calculate, BillData, ItemData, AssignmentData, ParticipantData,
)

router = APIRouter()


@router.post("/bills/{bill_id}/payments", response_model=PaymentOut)
def mark_payment(bill_id: str, body: PaymentCreate, db: Client = Depends(get_db)):
    bill = db.table("bills").select("id,status").eq("id", bill_id).single().execute()
    if not bill.data:
        raise HTTPException(404, "Bill not found")

    row = db.table("payments").insert({
        "bill_id": bill_id,
        "participant_id": body.participant_id,
        "amount": float(body.amount),
        "note": body.note,
    }).execute().data[0]

    # Check if fully settled
    _check_and_settle(db, bill_id)

    return PaymentOut(
        id=row["id"],
        participant_id=row["participant_id"],
        amount=Decimal(str(row["amount"])),
        paid_at=str(row["paid_at"]),
        note=row.get("note"),
    )


@router.get("/bills/{bill_id}/summary")
def get_summary(bill_id: str, db: Client = Depends(get_db)):
    """Return per-participant owed vs paid totals."""
    bill_row = db.table("bills").select("*").eq("id", bill_id).single().execute().data
    if not bill_row:
        raise HTTPException(404, "Bill not found")

    items = db.table("items").select("*").eq("bill_id", bill_id).execute().data
    assignments = db.table("item_assignments").select("*").eq(
        "item_id", db.table("items").select("id").eq("bill_id", bill_id)
    ).execute().data if items else []
    participants = db.table("participants").select("*").eq("bill_id", bill_id).execute().data
    payments = db.table("payments").select("*").eq("bill_id", bill_id).execute().data

    # Refetch assignments directly joined on bill
    assignments = (
        db.rpc("get_bill_assignments", {"p_bill_id": bill_id}).execute().data
        if False  # use simple query below instead
        else db.table("item_assignments")
        .select("*,items!inner(bill_id)")
        .eq("items.bill_id", bill_id)
        .execute()
        .data
    )

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
    participant_data = [
        ParticipantData(id=p["id"], is_birthday=p["is_birthday"], birthday_opt_in=p["birthday_opt_in"])
        for p in participants
    ]

    result = calculate(bill_data, item_data, assignment_data, participant_data)

    # Sum payments per participant
    paid_by_participant: dict = {}
    for pmt in payments:
        paid_by_participant[pmt["participant_id"]] = (
            paid_by_participant.get(pmt["participant_id"], Decimal("0"))
            + Decimal(str(pmt["amount"]))
        )

    summaries = []
    for p in participants:
        owed = result.participant_totals.get(p["id"], Decimal("0"))
        paid = paid_by_participant.get(p["id"], Decimal("0"))
        summaries.append({
            "id": p["id"],
            "display_name": p["display_name"],
            "is_birthday": p["is_birthday"],
            "has_selected": p["has_selected"],
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


def _check_and_settle(db: Client, bill_id: str) -> None:
    summary = get_summary(bill_id, db)
    all_settled = all(s["balance"] <= 0 for s in summary["participants"])
    if all_settled and summary["status"] == "open":
        db.table("bills").update({"status": "settled"}).eq("id", bill_id).execute()
