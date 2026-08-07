from sqlalchemy import func, select

from app.models import Budget


def put(client, category_id, cents, month):
    r = client.put(
        "/api/budgets",
        json={"category_id": category_id, "amount_cents": cents, "valid_from": month},
    )
    assert r.status_code == 200


def get_map(client, month):
    return {
        l["category_id"]: l["amount_cents"]
        for l in client.get("/api/budgets", params={"month": month}).json()
    }


def test_copy_snapshots_effective_values(client, session):
    # cat 1 definido em 2026-05 (herdado em jun), cat 2 definido em 2026-06
    put(client, 1, 100000, "2026-05")
    put(client, 2, 50000, "2026-06")
    # destino tem valor próprio que deve ser sobrescrito
    put(client, 1, 999999, "2026-08")

    r = client.post(
        "/api/budgets/copy", json={"from_month": "2026-06", "to_month": "2026-08"}
    )
    assert r.status_code == 200
    assert r.json()["copied"] >= 2

    m = get_map(client, "2026-08")
    assert m[1] == 100000  # herdado de maio via junho
    assert m[2] == 50000
    # categoria sem orçamento na origem zera no destino (snapshot exato)
    zeroed = [cid for cid, cents in m.items() if cents == 0]
    assert zeroed  # seed tem mais categorias ativas do que as 2 orçadas


def test_copy_twice_is_idempotent(client, session):
    put(client, 1, 100000, "2026-06")
    for _ in range(2):
        r = client.post(
            "/api/budgets/copy", json={"from_month": "2026-06", "to_month": "2026-08"}
        )
        assert r.status_code == 200
    rows = session.scalar(
        select(func.count()).select_from(Budget).where(Budget.valid_from == "2026-08")
    )
    copied = r.json()["copied"]
    assert rows == copied  # sem duplicatas (unique category_id+valid_from)


def test_copy_validates_months(client):
    assert (
        client.post(
            "/api/budgets/copy", json={"from_month": "2026-06", "to_month": "2026-06"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/budgets/copy", json={"from_month": "junho", "to_month": "2026-08"}
        ).status_code
        == 400
    )


def test_copy_from_future_month_into_past(client):
    """Copiar de mês futuro é intencional (ex.: ajustes feitos em julho
    replicados para junho). O mês futuro mantém suas próprias linhas."""
    put(client, 1, 100000, "2026-06")
    put(client, 1, 777700, "2026-07")  # ajuste feito em julho

    r = client.post(
        "/api/budgets/copy", json={"from_month": "2026-07", "to_month": "2026-06"}
    )
    assert r.status_code == 200
    assert get_map(client, "2026-06")[1] == 777700  # junho recebeu o de julho
    assert get_map(client, "2026-07")[1] == 777700  # julho segue com o dele
