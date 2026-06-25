from __future__ import annotations

from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class PaymentCreate(BaseModel):
    participant_id: str
    amount: Decimal
    note: Optional[str] = None


class PaymentOut(BaseModel):
    id: str
    participant_id: str
    amount: Decimal
    paid_at: str
    note: Optional[str]
