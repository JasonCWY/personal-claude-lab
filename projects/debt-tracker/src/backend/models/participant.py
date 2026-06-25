from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel


class ParticipantCreate(BaseModel):
    display_name: str
    is_birthday: bool = False


class ParticipantOut(BaseModel):
    id: str
    display_name: str
    invite_token: str
    is_birthday: bool
    birthday_opt_in: bool
    has_selected: bool


class SelectionItem(BaseModel):
    item_id: str
    sharing_with: List[str] = []


class SelectionSubmit(BaseModel):
    assignments: List[SelectionItem]
    birthday_opt_in: bool = False


class ParticipantSummary(BaseModel):
    participant: ParticipantOut
    amount_owed: Optional[float]
    amount_paid: float
    balance: Optional[float]
