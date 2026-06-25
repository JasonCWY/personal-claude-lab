from __future__ import annotations

import traceback
from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from supabase import Client

from ..database import get_db
from ..models.bill import BillOut, BillUpdate, ItemOut, ItemCreate, ParsedReceipt
from ..services import receipt_parser, storage

router = APIRouter()


def _fetch_bill(db: Client, bill_id: str) -> dict:
    row = db.table("bills").select("*").eq("id", bill_id).single().execute()
    if not row.data:
        raise HTTPException(404, "Bill not found")
    return row.data


def _fetch_items(db: Client, bill_id: str) -> List[dict]:
    return db.table("items").select("*").eq("bill_id", bill_id).order("sort_order").execute().data


@router.post("/bills", response_model=BillOut)
async def create_bill(
    title: str = Form(...),
    currency: str = Form("SGD"),
    file: UploadFile = File(...),
    db: Client = Depends(get_db),
):
    # Create draft bill (requires auth; for MVP we skip auth and use service role)
    # TODO: wire auth.uid() when Supabase Auth is set up
    bill_row = db.table("bills").insert({
        "title": title,
        "currency": currency,
        "created_by": "00000000-0000-0000-0000-000000000000",  # placeholder
    }).execute().data[0]
    bill_id = bill_row["id"]

    # Upload image to Supabase Storage
    file_bytes = await file.read()
    image_path = storage.upload_receipt(db, bill_id, file_bytes, file.content_type or "image/jpeg")

    # Parse receipt with Claude
    try:
        image_b64, media_type = storage.read_receipt_as_base64(db, image_path)
        parsed: ParsedReceipt = receipt_parser.parse_receipt(image_b64, media_type)
    except Exception as exc:
        print(f"[receipt parsing error] {exc}")
        traceback.print_exc()
        db.table("bills").update({"receipt_image_url": image_path}).eq("id", bill_id).execute()
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

    # Insert items
    subtotal = parsed.subtotal or sum(
        (i.unit_price or Decimal("0")) * i.quantity for i in parsed.items
    )
    items_payload = [
        {
            "bill_id": bill_id,
            "name": i.name,
            "unit_price": float(i.unit_price) if i.unit_price else 0,
            "quantity": i.quantity,
            "sort_order": idx,
        }
        for idx, i in enumerate(parsed.items)
    ]
    inserted_items = db.table("items").insert(items_payload).execute().data if items_payload else []

    tax = parsed.tax or Decimal("0")
    service_charge = parsed.service_charge or Decimal("0")
    total = parsed.total or (subtotal + tax + service_charge)

    db.table("bills").update({
        "receipt_image_url": image_path,
        "subtotal": float(subtotal),
        "tax": float(tax),
        "service_charge": float(service_charge),
        "total": float(total),
        "currency": parsed.currency or currency,
    }).eq("id", bill_id).execute()

    items_out = [
        ItemOut(
            id=r["id"],
            name=r["name"],
            unit_price=Decimal(str(r["unit_price"])),
            quantity=r["quantity"],
            total_price=Decimal(str(r["total_price"])),
            sort_order=r["sort_order"],
        )
        for r in inserted_items
    ]

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
def get_bill(bill_id: str, db: Client = Depends(get_db)):
    bill = _fetch_bill(db, bill_id)
    raw_items = _fetch_items(db, bill_id)
    items_out = [
        ItemOut(
            id=r["id"],
            name=r["name"],
            unit_price=Decimal(str(r["unit_price"])),
            quantity=r["quantity"],
            total_price=Decimal(str(r["total_price"])),
            sort_order=r["sort_order"],
        )
        for r in raw_items
    ]
    return BillOut(
        id=bill["id"],
        title=bill["title"],
        currency=bill["currency"],
        subtotal=Decimal(str(bill["subtotal"])) if bill["subtotal"] else None,
        tax=Decimal(str(bill["tax"] or 0)),
        service_charge=Decimal(str(bill["service_charge"] or 0)),
        total=Decimal(str(bill["total"])) if bill["total"] else None,
        actual_payer_id=bill["actual_payer_id"],
        receipt_image_url=bill["receipt_image_url"],
        status=bill["status"],
        items=items_out,
    )


@router.patch("/bills/{bill_id}", response_model=BillOut)
def update_bill(bill_id: str, body: BillUpdate, db: Client = Depends(get_db)):
    _fetch_bill(db, bill_id)
    updates: dict = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.tax is not None:
        updates["tax"] = float(body.tax)
    if body.service_charge is not None:
        updates["service_charge"] = float(body.service_charge)
    if body.actual_payer_id is not None:
        updates["actual_payer_id"] = body.actual_payer_id

    if body.items is not None:
        db.table("items").delete().eq("bill_id", bill_id).execute()
        if body.items:
            payload = [
                {
                    "bill_id": bill_id,
                    "name": i.name,
                    "unit_price": float(i.unit_price),
                    "quantity": i.quantity,
                    "sort_order": idx,
                }
                for idx, i in enumerate(body.items)
            ]
            db.table("items").insert(payload).execute()
        raw_items = _fetch_items(db, bill_id)
        new_subtotal = sum(Decimal(str(r["total_price"])) for r in raw_items)
        updates["subtotal"] = float(new_subtotal)

    if updates:
        db.table("bills").update(updates).eq("id", bill_id).execute()

    return get_bill(bill_id, db)


@router.post("/bills/{bill_id}/share")
def share_bill(bill_id: str, db: Client = Depends(get_db)):
    """Open the bill so participants can access their invite links."""
    _fetch_bill(db, bill_id)
    db.table("bills").update({"status": "open"}).eq("id", bill_id).execute()
    participants = (
        db.table("participants").select("id,display_name,invite_token").eq("bill_id", bill_id).execute().data
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
