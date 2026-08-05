from datetime import date

from sqlalchemy import select

from app.models import Category, Rule, Transaction


def seed_tx(session, **kw):
    defaults = dict(
        account_id=1, date=date(2026, 8, 5), description="UBER TRIP 99",
        normalized="UBER TRIP", amount_cents=-2350, dedupe_hash="h-uber",
    )
    defaults.update(kw)
    tx = Transaction(**defaults)
    session.add(tx)
    session.flush()
    return tx


def test_list_transactions_with_filters(client, session):
    seed_tx(session)
    seed_tx(session, date=date(2026, 7, 1), dedupe_hash="h2", description="MERCADO")
    r = client.get("/api/transactions", params={"month": "2026-08"})
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1 and body[0]["description"] == "UBER TRIP 99"
    r = client.get("/api/transactions", params={"q": "mercado"})
    assert len(r.json()) == 1


def test_patch_category_creates_rule(client, session):
    tx = seed_tx(session)
    transporte = session.scalar(select(Category).where(Category.name == "Transporte"))
    r = client.patch(f"/api/transactions/{tx.id}", json={"category_id": transporte.id})
    assert r.status_code == 200
    assert r.json()["source"] == "manual"
    rule = session.scalar(select(Rule).where(Rule.matcher == "UBER TRIP"))
    assert rule.category_id == transporte.id


def test_patch_ignored_toggle(client, session):
    tx = seed_tx(session)
    r = client.patch(f"/api/transactions/{tx.id}", json={"ignored": True})
    assert r.json()["ignored"] is True


def test_budget_put_and_month_view(client, session):
    mercado = session.scalar(select(Category).where(Category.name == "Mercado"))
    r = client.put("/api/budgets", json={
        "category_id": mercado.id, "amount_cents": 150000, "valid_from": "2026-01",
    })
    assert r.status_code == 200
    r = client.put("/api/budgets", json={  # atualizar mesma vigência não duplica
        "category_id": mercado.id, "amount_cents": 160000, "valid_from": "2026-01",
    })
    assert r.status_code == 200
    view = client.get("/api/budgets", params={"month": "2026-08"}).json()
    linha = next(b for b in view if b["category_id"] == mercado.id)
    assert linha["amount_cents"] == 160000


def test_invalid_month_format_is_400(client):
    assert client.get("/api/transactions", params={"month": "08/2026"}).status_code == 400
