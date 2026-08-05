from datetime import date

from sqlalchemy import select

from app.models import Budget, Category, Transaction
from app.services.bridge import bridge, months_for_period


def cat(session, name):
    return session.scalar(select(Category).where(Category.name == name))


def add_tx(session, cat_id, cents, d):
    session.add(Transaction(
        account_id=1, date=d, description="X", normalized="X",
        amount_cents=cents, category_id=cat_id,
        dedupe_hash=f"h{cat_id}-{cents}-{d}",
    ))
    session.flush()


def test_months_for_period():
    assert months_for_period("month", "2026-08") == ["2026-08"]
    assert months_for_period("ytd", "2026-03") == ["2026-01", "2026-02", "2026-03"]
    twelve = months_for_period("12m", "2026-08")
    assert twelve[0] == "2025-09" and twelve[-1] == "2026-08" and len(twelve) == 12


def test_bridge_single_month(session):
    salario, mercado = cat(session, "Salário"), cat(session, "Mercado")
    session.add_all([
        Budget(category_id=salario.id, amount_cents=850000, valid_from="2026-01"),
        Budget(category_id=mercado.id, amount_cents=150000, valid_from="2026-01"),
    ])
    add_tx(session, salario.id, 850000, date(2026, 8, 5))
    add_tx(session, mercado.id, -178000, date(2026, 8, 9))

    b = bridge(session, "month", "2026-08")
    assert b["start"] == 700000  # saldo orçado
    assert b["end"] == 672000  # saldo real
    step = next(s for s in b["steps"] if s["categoria"] == "Mercado")
    assert step["delta"] == -28000  # gastou 28000 a mais => piora o saldo
    assert b["start"] + sum(s["delta"] for s in b["steps"]) == b["end"]


def test_bridge_aggregates_small_deviations_into_demais(session):
    cats = [c for c in session.scalars(select(Category)) if c.kind == "saida"][:10]
    for i, c in enumerate(cats):
        add_tx(session, c.id, -(1000 + i), date(2026, 8, 5))
    b = bridge(session, "month", "2026-08")
    assert len(b["steps"]) <= 9  # top 8 + "Demais"
    assert any(s["categoria"] == "Demais" for s in b["steps"])
    assert b["start"] + sum(s["delta"] for s in b["steps"]) == b["end"]


def test_bridge_uncategorized_split_by_sign(session):
    add_tx(session, None, 850000, date(2026, 8, 5))
    add_tx(session, None, -7000, date(2026, 8, 6))
    b = bridge(session, "month", "2026-08")
    names = {s["categoria"] for s in b["steps"]}
    assert "Sem categoria (entradas)" in names and "Sem categoria (saídas)" in names
    assert b["start"] + sum(s["delta"] for s in b["steps"]) == b["end"]


def test_bridge_respects_budget_effective_dates_across_period(session):
    mercado = cat(session, "Mercado")
    session.add_all([
        Budget(category_id=mercado.id, amount_cents=100000, valid_from="2026-01"),
        Budget(category_id=mercado.id, amount_cents=200000, valid_from="2026-08"),
    ])
    b = bridge(session, "ytd", "2026-08")
    # 7 meses a 100000 + 1 mês a 200000, tudo saída
    assert b["start"] == -(7 * 100000 + 200000)
