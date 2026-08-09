from datetime import date

from app.dedupe import make_hash


def test_same_fields_same_hash():
    a = make_hash(1, date(2026, 7, 1), -100, "MERCADO")
    b = make_hash(1, date(2026, 7, 1), -100, "MERCADO")
    c = make_hash(1, date(2026, 7, 1), -101, "MERCADO")
    assert a == b and a != c


def test_description_case_and_spaces_are_normalized():
    a = make_hash(1, date(2026, 7, 1), -100, " Mercado ")
    b = make_hash(1, date(2026, 7, 1), -100, "MERCADO")
    assert a == b


def test_seq_distinguishes_repeated_occurrences():
    a = make_hash(1, date(2026, 7, 1), -100, "MERCADO", seq=1)
    b = make_hash(1, date(2026, 7, 1), -100, "MERCADO", seq=2)
    assert a != b


def test_account_scopes_hash():
    a = make_hash(1, date(2026, 7, 1), -100, "X")
    b = make_hash(2, date(2026, 7, 1), -100, "X")
    assert a != b
