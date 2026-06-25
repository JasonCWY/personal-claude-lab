import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from decimal import Decimal
from src.backend.services.calculator import (
    calculate, BillData, ItemData, AssignmentData, ParticipantData,
)


def bill(subtotal, tax=0, service_charge=0, actual_payer_id=None):
    return BillData(
        subtotal=Decimal(str(subtotal)),
        tax=Decimal(str(tax)),
        service_charge=Decimal(str(service_charge)),
        actual_payer_id=actual_payer_id,
    )


def item(id, price):
    return ItemData(id=id, total_price=Decimal(str(price)))


def assign(item_id, participant_id, num=1, den=1):
    return AssignmentData(
        item_id=item_id,
        participant_id=participant_id,
        share_numerator=num,
        share_denominator=den,
    )


def participant(id, is_birthday=False, birthday_opt_in=False):
    return ParticipantData(id=id, is_birthday=is_birthday, birthday_opt_in=birthday_opt_in)


# --- Individual splitting ---

def test_individual_items_no_surcharge():
    result = calculate(
        bill=bill(subtotal=30),
        items=[item("i1", 10), item("i2", 10), item("i3", 10)],
        assignments=[
            assign("i1", "alice"),
            assign("i2", "bob"),
            assign("i3", "charlie"),
        ],
        participants=[participant("alice"), participant("bob"), participant("charlie")],
    )
    assert result.participant_totals["alice"] == Decimal("10.00")
    assert result.participant_totals["bob"] == Decimal("10.00")
    assert result.participant_totals["charlie"] == Decimal("10.00")
    assert result.unassigned_amount == Decimal("0.00")


def test_individual_items_with_tax_and_service():
    result = calculate(
        bill=bill(subtotal=100, tax=9, service_charge=10),
        items=[item("i1", 60), item("i2", 40)],
        assignments=[assign("i1", "alice"), assign("i2", "bob")],
        participants=[participant("alice"), participant("bob")],
    )
    # alice: 60 * (1 + 19/100) = 60 * 1.19 = 71.40
    # bob:   40 * 1.19 = 47.60
    assert result.participant_totals["alice"] == Decimal("71.40")
    assert result.participant_totals["bob"] == Decimal("47.60")


# --- Shared splitting ---

def test_shared_item_three_ways():
    result = calculate(
        bill=bill(subtotal=30),
        items=[item("i1", 30)],
        assignments=[
            assign("i1", "alice", 1, 3),
            assign("i1", "bob", 1, 3),
            assign("i1", "charlie", 1, 3),
        ],
        participants=[participant("alice"), participant("bob"), participant("charlie")],
    )
    assert result.participant_totals["alice"] == Decimal("10.00")
    assert result.participant_totals["bob"] == Decimal("10.00")
    assert result.participant_totals["charlie"] == Decimal("10.00")


def test_mixed_individual_and_shared():
    # alice has her own item ($20); bob and charlie share an item ($30)
    result = calculate(
        bill=bill(subtotal=50),
        items=[item("i1", 20), item("i2", 30)],
        assignments=[
            assign("i1", "alice"),
            assign("i2", "bob", 1, 2),
            assign("i2", "charlie", 1, 2),
        ],
        participants=[participant("alice"), participant("bob"), participant("charlie")],
    )
    assert result.participant_totals["alice"] == Decimal("20.00")
    assert result.participant_totals["bob"] == Decimal("15.00")
    assert result.participant_totals["charlie"] == Decimal("15.00")


# --- Birthday redistribution ---

def test_birthday_no_opt_ins():
    # birthday person's share is zeroed; no one opts in, so amount just disappears
    result = calculate(
        bill=bill(subtotal=30),
        items=[item("i1", 10), item("i2", 10), item("i3", 10)],
        assignments=[
            assign("i1", "alice"),
            assign("i2", "bob"),
            assign("i3", "charlie"),
        ],
        participants=[
            participant("alice", is_birthday=True),
            participant("bob"),
            participant("charlie"),
        ],
    )
    assert result.participant_totals["alice"] == Decimal("0.00")
    assert result.participant_totals["bob"] == Decimal("10.00")
    assert result.participant_totals["charlie"] == Decimal("10.00")


def test_birthday_with_opt_ins():
    # alice is birthday; bob and charlie opt in to cover her $10
    result = calculate(
        bill=bill(subtotal=30),
        items=[item("i1", 10), item("i2", 10), item("i3", 10)],
        assignments=[
            assign("i1", "alice"),
            assign("i2", "bob"),
            assign("i3", "charlie"),
        ],
        participants=[
            participant("alice", is_birthday=True),
            participant("bob", birthday_opt_in=True),
            participant("charlie", birthday_opt_in=True),
        ],
    )
    assert result.participant_totals["alice"] == Decimal("0.00")
    # alice's $10 split between bob and charlie: each pays extra $5
    assert result.participant_totals["bob"] == Decimal("15.00")
    assert result.participant_totals["charlie"] == Decimal("15.00")


def test_birthday_single_opt_in():
    result = calculate(
        bill=bill(subtotal=30),
        items=[item("i1", 10), item("i2", 10), item("i3", 10)],
        assignments=[
            assign("i1", "alice"),
            assign("i2", "bob"),
            assign("i3", "charlie"),
        ],
        participants=[
            participant("alice", is_birthday=True),
            participant("bob", birthday_opt_in=True),
            participant("charlie"),
        ],
    )
    assert result.participant_totals["alice"] == Decimal("0.00")
    assert result.participant_totals["bob"] == Decimal("20.00")
    assert result.participant_totals["charlie"] == Decimal("10.00")


# --- Third-party payer ---

def test_third_party_payer():
    result = calculate(
        bill=bill(subtotal=60, actual_payer_id="charlie"),
        items=[item("i1", 30), item("i2", 30)],
        assignments=[assign("i1", "alice"), assign("i2", "bob")],
        participants=[participant("alice"), participant("bob"), participant("charlie")],
    )
    # individual totals unchanged
    assert result.participant_totals["alice"] == Decimal("30.00")
    assert result.participant_totals["bob"] == Decimal("30.00")
    # creator owes charlie the full $60
    assert result.creator_owes_payer == Decimal("60.00")


# --- Unassigned amount ---

def test_unassigned_items():
    result = calculate(
        bill=bill(subtotal=50),
        items=[item("i1", 30), item("i2", 20)],
        assignments=[assign("i1", "alice")],
        participants=[participant("alice"), participant("bob")],
    )
    assert result.participant_totals["alice"] == Decimal("30.00")
    assert result.participant_totals["bob"] == Decimal("0.00")
    assert result.unassigned_amount == Decimal("20.00")


def test_partially_assigned_item():
    # item worth $30, only alice claimed 1/3 of it
    result = calculate(
        bill=bill(subtotal=30),
        items=[item("i1", 30)],
        assignments=[assign("i1", "alice", 1, 3)],
        participants=[participant("alice"), participant("bob")],
    )
    assert result.participant_totals["alice"] == Decimal("10.00")
    assert result.unassigned_amount == Decimal("20.00")
