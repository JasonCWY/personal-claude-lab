from __future__ import annotations

from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel


class ItemCreate(BaseModel):
    name: str
    unit_price: Decimal
    quantity: int = 1
    sort_order: int = 0


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    unit_price: Optional[Decimal] = None
    quantity: Optional[int] = None


class ItemOut(BaseModel):
    id: str
    name: str
    unit_price: Decimal
    quantity: int
    total_price: Decimal
    sort_order: int


class BillCreate(BaseModel):
    title: str
    currency: str = "SGD"


class BillUpdate(BaseModel):
    title: Optional[str] = None
    items: Optional[List[ItemCreate]] = None
    tax: Optional[Decimal] = None
    service_charge: Optional[Decimal] = None
    actual_payer_id: Optional[str] = None


class BillOut(BaseModel):
    id: str
    title: str
    currency: str
    subtotal: Optional[Decimal]
    tax: Decimal
    service_charge: Decimal
    total: Optional[Decimal]
    actual_payer_id: Optional[str]
    receipt_image_url: Optional[str]
    status: str
    items: List[ItemOut] = []


class ParsedReceiptItem(BaseModel):
    name: str
    unit_price: Optional[Decimal]
    quantity: int = 1


class ParsedReceipt(BaseModel):
    currency: str = "SGD"
    items: List[ParsedReceiptItem]
    subtotal: Optional[Decimal]
    tax: Optional[Decimal]
    service_charge: Optional[Decimal]
    total: Optional[Decimal]
    notes: Optional[str]
