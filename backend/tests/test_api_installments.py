from datetime import date

from sqlalchemy import select

from app.models import Account, Budget, Category, Transaction


def _add_tx(session, desc, cents, num, tot, cat=None):
    cartao = session.scalar(select(Account.id).where(Account.kind == "cartao"))
    session.add(Transaction(
        account_id=cartao, date=date(2026, 7, 15), description=desc,
        normalized=desc.upper(), amount_cents=cents, category_id=cat,
        dedupe_hash=f"api-{desc}", installment=f"{num:02d}/{tot:02d}",
        installment_number=num, installment_total=tot,
    ))
    session.commit()


def test_projection_mes_invalido(client):
    assert client.get("/api/installments/projection?month=2026-13").status_code == 400
    assert client.get("/api/installments/projection?month=x").status_code == 400


def test_projection_ok(client, session):
    mercado = session.scalar(select(Category.id).where(Category.name == "Mercado"))
    session.add(Budget(category_id=mercado, amount_cents=40000, valid_from="2026-01"))
    _add_tx(session, "MAGALU 03/10", -45000, 3, 10, cat=mercado)

    r = client.get("/api/installments/projection?month=2026-07")
    assert r.status_code == 200
    body = r.json()
    assert body["month"] == "2026-07"
    assert len(body["months"]) == 7
    assert body["categorias"][0]["status"] == ["estouro"] * 7
    assert body["series"][0]["conta"] == "Bradesco Cartão"


def test_projection_vazia(client):
    r = client.get("/api/installments/projection?month=2026-07")
    assert r.status_code == 200
    assert r.json()["series"] == []
