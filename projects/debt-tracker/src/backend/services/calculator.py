from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional


@dataclass
class BillData:
    subtotal: Decimal
    tax: Decimal
    service_charge: Decimal
    actual_payer_id: Optional[str]


@dataclass
class ItemData:
    id: str
    total_price: Decimal


@dataclass
class AssignmentData:
    item_id: str
    participant_id: str
    share_numerator: int
    share_denominator: int


@dataclass
class ParticipantData:
    id: str
    is_birthday: bool
    birthday_opt_in: bool


@dataclass
class CalculationResult:
    participant_totals: Dict[str, Decimal]
    creator_owes_payer: Decimal
    unassigned_amount: Decimal


def calculate(
    bill: BillData,
    items: List[ItemData],
    assignments: List[AssignmentData],
    participants: List[ParticipantData],
) -> CalculationResult:
    item_price = {item.id: item.total_price for item in items}

    # Step 1: base amounts from item assignments
    participant_base: Dict[str, Decimal] = {p.id: Decimal("0") for p in participants}
    assigned_fractions: Dict[str, Decimal] = {item.id: Decimal("0") for item in items}

    for a in assignments:
        share = Decimal(a.share_numerator) / Decimal(a.share_denominator)
        participant_base[a.participant_id] += item_price[a.item_id] * share
        assigned_fractions[a.item_id] += share

    # Step 2: proportional surcharges
    surcharge_ratio = Decimal("0")
    if bill.subtotal and bill.subtotal > 0:
        surcharge_ratio = (bill.tax + bill.service_charge) / bill.subtotal

    participant_total: Dict[str, Decimal] = {
        pid: (base * (1 + surcharge_ratio)).quantize(Decimal("0.01"), ROUND_HALF_UP)
        for pid, base in participant_base.items()
    }

    # Step 3: birthday redistribution
    birthday_pids = [p.id for p in participants if p.is_birthday]
    opt_in_pids = [p.id for p in participants if p.birthday_opt_in]

    for birthday_pid in birthday_pids:
        birthday_amount = participant_total[birthday_pid]
        if opt_in_pids and birthday_amount > 0:
            per_person_extra = (birthday_amount / len(opt_in_pids)).quantize(
                Decimal("0.01"), ROUND_HALF_UP
            )
            for pid in opt_in_pids:
                participant_total[pid] += per_person_extra
        participant_total[birthday_pid] = Decimal("0")

    # Step 4: unassigned amount (items no one has claimed yet, including partial)
    unassigned_base = sum(
        item_price[iid] * (1 - assigned_fractions[iid])
        for iid in assigned_fractions
    )
    unassigned_amount = (unassigned_base * (1 + surcharge_ratio)).quantize(
        Decimal("0.01"), ROUND_HALF_UP
    )

    # Step 5: third-party payer — creator owes the external payer the full bill
    creator_owes_payer = Decimal("0")
    if bill.actual_payer_id:
        creator_owes_payer = sum(participant_total.values()).quantize(
            Decimal("0.01"), ROUND_HALF_UP
        )

    return CalculationResult(
        participant_totals=participant_total,
        creator_owes_payer=creator_owes_payer,
        unassigned_amount=unassigned_amount,
    )
