from datetime import date
from pathlib import Path

from sqlalchemy import func, select

from app.models import Transaction

FIXTURES = Path(__file__).parent / "fixtures"


def upload(client, filename="bradesco_conta.ofx", account_id=1):
    return client.post(
        "/api/imports",
        data={"account_id": str(account_id)},
        files={"file": (filename, (FIXTURES / filename).read_bytes())},
    )


def test_import_endpoint_returns_summary(client):
    r = upload(client)
    assert r.status_code == 200
    body = r.json()
    assert body["new_count"] == 3 and body["dup_count"] == 0
    # 3 novas, 1 ignorada (pagto fatura) => 2 classificáveis; sem LLM: done na hora
    assert body["classification"] == {
        "status": "done",
        "total": 2,
        "done": 0,
        "counts": {"regra": 0, "llm": 0, "pendente": 2},
    }


def test_import_invalid_file_is_400_and_writes_nothing(client, session):
    r = client.post(
        "/api/imports",
        data={"account_id": "1"},
        files={"file": ("x.ofx", b"lixo")},
    )
    assert r.status_code == 400
    assert session.scalar(select(func.count()).select_from(Transaction)) == 0


def test_import_list_and_undo(client, session):
    batch_id = upload(client).json()["batch_id"]
    assert len(client.get("/api/imports").json()) == 1
    assert client.delete(f"/api/imports/{batch_id}").status_code == 204
    assert session.scalar(select(func.count()).select_from(Transaction)) == 0


def test_dashboard_summary_and_feed(client, session):
    upload(client)
    tx = session.scalar(select(Transaction).where(Transaction.amount_cents == -18740))
    tx.category_id, tx.source = 1, "llm"
    session.flush()
    summary = client.get("/api/dashboard/summary", params={"month": "2026-07"}).json()
    assert summary["entradas"]["real"] == 850000
    feed = client.get("/api/dashboard/feed").json()
    assert len(feed) == 1 and feed[0]["source"] == "llm"


def test_dashboard_bridge_endpoint(client):
    r = client.get("/api/dashboard/bridge", params={"period": "ytd", "ref": "2026-08"})
    assert r.status_code == 200
    assert r.json()["months"][0] == "2026-01"
    assert client.get(
        "/api/dashboard/bridge", params={"period": "errado", "ref": "2026-08"}
    ).status_code == 400


def test_classify_pending_endpoint_without_llm(client):
    upload(client)
    r = client.post("/api/classify/pending")
    assert r.status_code == 200
    assert r.json() == {"regra": 0, "llm": 0, "pendente": 2}


def test_classification_endpoint_and_404(client):
    batch_id = upload(client).json()["batch_id"]
    r = client.get(f"/api/imports/{batch_id}/classification")
    assert r.status_code == 200 and r.json()["status"] == "done"
    assert client.get("/api/imports/999/classification").status_code == 404


def test_import_with_llm_schedules_background_classification(client, session, monkeypatch):
    from sqlalchemy.orm import sessionmaker

    import app.routers.imports as imports_router
    from app.services import classify_job

    class FakeLLM:
        def classify(self, items, categories, examples=None):
            return {item["id"]: categories[0] for item in items}

    fake = FakeLLM()
    monkeypatch.setattr(imports_router, "get_llm", lambda s: fake)
    monkeypatch.setattr(classify_job, "get_llm", lambda s: fake)
    monkeypatch.setattr(
        classify_job, "SessionLocal", sessionmaker(bind=session.get_bind())
    )

    body = upload(client).json()
    assert body["classification"]["status"] == "running"  # snapshot na resposta
    r = client.get(f"/api/imports/{body['batch_id']}/classification").json()
    assert r["status"] == "done" and r["counts"]["llm"] == 2 and r["done"] == 2
