from __future__ import annotations

import sqlite3
import traceback
from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ..database import execute, get_db, money, new_id, query_all, query_one, to_money
from ..models.bill import BillOut, BillUpdate, ItemOut, ParsedReceipt
from ..services import receipt_parser, storage

router = APIRouter()


def _fetch_bill(db: sqlite3.Connection, bill_id: str) -> dict:
    row = query_one(db, "SELECT * FROM bills WHERE id = ?", (bill_id,))
    if not row:
        raise HTTPException(404, "Bill not found")
    return row


def _fetch_items(db: sqlite3.Connection, bill_id: str) -> List[dict]:
    return query_all(
        db, "SELECT * FROM items WHERE bill_id = ? ORDER BY sort_order", (bill_id,)
    )


def _item_out(r: dict) -> ItemOut:
    return ItemOut(
        id=r["id"],
        name=r["name"],
        unit_price=to_money(r["unit_price"]),
        quantity=r["quantity"],
        total_price=to_money(r["total_price"]),
        sort_order=r["sort_order"],
    )


@router.post("/bills", response_model=BillOut)
async def create_bill(
    title: str = Form(...),
    currency: str = Form("MYR"),
    file: UploadFile = File(...),
    db: sqlite3.Connection = Depends(get_db),
):
    bill_id = new_id()
    execute(
        db,
        "INSERT INTO bills (id, title, currency) VALUES (?, ?, ?)",
        (bill_id, title, currency),
    )

    file_bytes = await file.read()
    image_path = storage.upload_receipt(bill_id, file_bytes, file.content_type or "image/jpeg")

    try:
        image_b64, media_type = storage.read_receipt_as_base64(image_path)
        parsed: ParsedReceipt = receipt_parser.parse_receipt(image_b64, media_type)
    except Exception as exc:
        print(f"[receipt parsing error] {exc}")
        traceback.print_exc()
        execute(db, "UPDATE bills SET receipt_image_url = ? WHERE id = ?", (image_path, bill_id))
        return BillOut(
            id=bill_id,
            title=title,
            currency=currency,
            subtotal=None,
            tax=Decimal("0"),
            service_charge=Decimal("0"),
            total=None,
            actual_payer_id=None,
            receipt_image_url=image_path,
            status="draft",
            items=[],
        )

    subtotal = parsed.subtotal or sum(
        (i.unit_price or Decimal("0")) * i.quantity for i in parsed.items
    )
    item_ids = [new_id() for _ in parsed.items]
    if parsed.items:
        db.executemany(
            "INSERT INTO items (id, bill_id, name, unit_price, quantity, sort_order)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            [
                (
                    item_ids[idx],
                    bill_id,
                    i.name,
                    money(i.unit_price or 0),
                    i.quantity,
                    idx,
                )
                for idx, i in enumerate(parsed.items)
            ],
        )
        db.commit()

    tax = parsed.tax or Decimal("0")
    service_charge = parsed.service_charge or Decimal("0")
    total = parsed.total or (subtotal + tax + service_charge)

    execute(
        db,
        "UPDATE bills SET receipt_image_url = ?, subtotal = ?, tax = ?,"
        " service_charge = ?, total = ?, currency = ? WHERE id = ?",
        (
            image_path,
            money(subtotal),
            money(tax),
            money(service_charge),
            money(total),
            parsed.currency or currency,
            bill_id,
        ),
    )

    items_out = [_item_out(r) for r in _fetch_items(db, bill_id)]

    return BillOut(
        id=bill_id,
        title=title,
        currency=parsed.currency or currency,
        subtotal=subtotal,
        tax=tax,
        service_charge=service_charge,
        total=total,
        actual_payer_id=None,
        receipt_image_url=image_path,
        status="draft",
        items=items_out,
    )


@router.get("/bills/{bill_id}", response_model=BillOut)
def get_bill(bill_id: str, db: sqlite3.Connection = Depends(get_db)):
    bill = _fetch_bill(db, bill_id)
    items_out = [_item_out(r) for r in _fetch_items(db, bill_id)]
    return BillOut(
        id=bill["id"],
        title=bill["title"],
        currency=bill["currency"],
        subtotal=to_money(bill["subtotal"]) if bill["subtotal"] is not None else None,
        tax=to_money(bill["tax"]),
        service_charge=to_money(bill["service_charge"]),
        total=to_money(bill["total"]) if bill["total"] is not None else None,
        actual_payer_id=bill["actual_payer_id"],
        receipt_image_url=bill["receipt_image_url"],
        status=bill["status"],
        items=items_out,
    )


@router.patch("/bills/{bill_id}", response_model=BillOut)
def update_bill(bill_id: str, body: BillUpdate, db: sqlite3.Connection = Depends(get_db)):
    _fetch_bill(db, bill_id)
    updates: dict = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.tax is not None:
        updates["tax"] = money(body.tax)
    if body.service_charge is not None:
        updates["service_charge"] = money(body.service_charge)
    if body.actual_payer_id is not None:
        updates["actual_payer_id"] = body.actual_payer_id

    if body.items is not None:
        execute(db, "DELETE FROM items WHERE bill_id = ?", (bill_id,))
        if body.items:
            db.executemany(
                "INSERT INTO items (id, bill_id, name, unit_price, quantity, sort_order)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                [
                    (new_id(), bill_id, i.name, money(i.unit_price), i.quantity, idx)
                    for idx, i in enumerate(body.items)
                ],
            )
            db.commit()
        raw_items = _fetch_items(db, bill_id)
        updates["subtotal"] = money(sum(to_money(r["total_price"]) for r in raw_items))

    if updates:
        assignments = ", ".join(f"{col} = ?" for col in updates)
        execute(
            db,
            f"UPDATE bills SET {assignments} WHERE id = ?",
            (*updates.values(), bill_id),
        )

    return get_bill(bill_id, db)


@router.post("/bills/{bill_id}/share")
def share_bill(bill_id: str, db: sqlite3.Connection = Depends(get_db)):
    """Open the bill so participants can access their invite links."""
    _fetch_bill(db, bill_id)
    execute(db, "UPDATE bills SET status = 'open' WHERE id = ?", (bill_id,))
    participants = query_all(
        db,
        "SELECT id, display_name, invite_token FROM participants WHERE bill_id = ?",
        (bill_id,),
    )
    base_url = "http://localhost:5173"
    links = [
        {
            "name": p["display_name"],
            "url": f"{base_url}/bill/{bill_id}/join/{p['invite_token']}",
        }
        for p in participants
    ]
    return {"status": "open", "invite_links": links}
