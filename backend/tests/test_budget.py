from datetime import date

from sqlalchemy import select

from app.models import Budget, Category, Transaction
from app.services.budget import budget_map, month_summary


def cat(session, name):
    return session.scalar(select(Category).where(Category.name == name))


def add_tx(session, cat_id, cents, d=date(2026, 8, 10), ignored=False):
    session.add(Transaction(
        account_id=1, date=d, description="X", normalized="X",
        amount_cents=cents, category_id=cat_id,
        dedupe_hash=f"h{cat_id}-{cents}-{d}", ignored=ignored,
    ))
    session.flush()


def test_budget_map_uses_latest_effective_value(session):
    mercado = cat(session, "Mercado")
    session.add_all([
        Budget(category_id=mercado.id, amount_cents=100000, valid_from="2026-01"),
        Budget(category_id=mercado.id, amount_cents=150000, valid_from="2026-06"),
    ])
    session.flush()
    assert budget_map(session, "2026-03")[mercado.id] == 100000
    assert budget_map(session, "2026-08")[mercado.id] == 150000
    assert budget_map(session, "2025-12") == {}


def test_month_summary_cash_flow(session):
    salario, mercado, invest = (
        cat(session, "Salário"), cat(session, "Mercado"), cat(session, "Investimentos")
    )
    session.add_all([
        Budget(category_id=salario.id, amount_cents=850000, valid_from="2026-01"),
        Budget(category_id=mercado.id, amount_cents=150000, valid_from="2026-01"),
        Budget(category_id=invest.id, amount_cents=200000, valid_from="2026-01"),
    ])
    add_tx(session, salario.id, 850000)
    add_tx(session, mercado.id, -124000)
    add_tx(session, invest.id, -200000)
    add_tx(session, mercado.id, -99900, ignored=True)  # não conta
    add_tx(session, mercado.id, -5000, d=date(2026, 7, 30))  # outro mês

    s = month_summary(session, "2026-08", today=date(2026, 8, 15))
    assert s["entradas"] == {"real": 850000, "orcado": 850000}
    assert s["saidas"] == {"real": 324000, "orcado": 350000}
    assert s["saldo"] == {"real": 526000, "orcado": 500000}
    # ritmo: (324000/350000) / (15/31)
    assert abs(s["ritmo"] - (324000 / 350000) / (15 / 31)) < 0.001
    linha_mercado = next(c for c in s["categorias"] if c["id"] == mercado.id)
    assert linha_mercado == {
        "id": mercado.id, "nome": "Mercado", "kind": "saida",
        "real": 124000, "orcado": 150000,
    }


def test_uncategorized_mixed_signs_do_not_net(session):
    add_tx(session, None, -7000)
    add_tx(session, None, 850000, d=date(2026, 8, 12))
    s = month_summary(session, "2026-08", today=date(2026, 8, 15))
    assert s["entradas"]["real"] == 850000
    assert s["saidas"]["real"] == 7000
    assert s["ritmo"] is None  # sem orçamento de saídas
