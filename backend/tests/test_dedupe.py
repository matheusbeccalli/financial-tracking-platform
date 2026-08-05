from datetime import date

from app.dedupe import make_hash


def test_fitid_wins_over_fields():
    a = make_hash(1, "FIT123", date(2026, 7, 1), -100, "X")
    b = make_hash(1, "FIT123", date(2026, 7, 2), -999, "Y")
    assert a == b


def test_fallback_uses_fields():
    a = make_hash(1, None, date(2026, 7, 1), -100, "MERCADO")
    b = make_hash(1, None, date(2026, 7, 1), -100, "MERCADO")
    c = make_hash(1, None, date(2026, 7, 1), -101, "MERCADO")
    assert a == b and a != c


def test_account_scopes_hash():
    a = make_hash(1, "FIT123", date(2026, 7, 1), -100, "X")
    b = make_hash(2, "FIT123", date(2026, 7, 1), -100, "X")
    assert a != b
