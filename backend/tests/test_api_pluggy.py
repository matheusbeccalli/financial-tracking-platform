"""Endpoints /api/pluggy com cliente fake via dependency_overrides."""
from datetime import date

from app.models import Transaction
from app.services.pluggy import PluggyError, get_pluggy


class FakePluggyApi:
    def __init__(self, status="UPDATED", accounts=None, txs=None):
        self.status = status
        self.accounts = accounts if accounts is not None else [
            {"id": "acc-1", "type": "BANK", "subtype": "CHECKING_ACCOUNT",
             "name": "Conta Corrente", "number": "0001"},
        ]
        self.txs = txs or {}

    def get_item(self, item_id):
        if item_id == "nao-existe":
            raise PluggyError("Item não encontrado na Pluggy — confira o Item ID no dashboard", 404)
        return {"id": item_id, "status": self.status, "connector": {"name": "Bradesco"}}

    def get_accounts(self, item_id):
        return self.accounts

    def get_transactions(self, account_id, date_from, date_to):
        return self.txs.get(account_id, [])


def use_fake(client, fake):
    client.app.dependency_overrides[get_pluggy] = lambda: fake
    return fake


def test_links_vazio_sem_credencial(client):
    r = client.get("/api/pluggy/links")
    assert r.status_code == 200
    body = r.json()
    assert body["credential_set"] is False
    assert body["links"] == []


def test_last_tx_dates_por_conta(client, session):
    session.add(Transaction(account_id=1, date=date(2026, 7, 30), description="X",
                            normalized="X", amount_cents=-100, dedupe_hash="h1"))
    session.commit()
    r = client.get("/api/pluggy/links")
    assert r.json()["last_tx_dates"]["1"] == "2026-07-30"


def test_item_accounts(client):
    use_fake(client, FakePluggyApi())
    r = client.get("/api/pluggy/items/item-1/accounts")
    assert r.status_code == 200
    body = r.json()
    assert body["item_status"] == "UPDATED"
    assert body["connector"] == "Bradesco"
    assert body["accounts"][0]["id"] == "acc-1"


def test_item_accounts_404(client):
    use_fake(client, FakePluggyApi())
    r = client.get("/api/pluggy/items/nao-existe/accounts")
    assert r.status_code == 404


def test_item_accounts_sem_credencial_503(client):
    r = client.get("/api/pluggy/items/item-1/accounts")
    assert r.status_code == 503
    assert ".env" in r.json()["detail"]


def test_cria_e_remove_vinculo(client):
    payload = {"item_id": "item-1", "pluggy_account_id": "acc-1",
               "pluggy_type": "BANK", "account_id": 1, "sync_from": "2026-08-01"}
    r = client.post("/api/pluggy/links", json=payload)
    assert r.status_code == 201
    link_id = r.json()["id"]
    assert r.json()["sync_from"] == "2026-08-01"
    assert r.json()["last_synced_at"] is None

    r2 = client.post("/api/pluggy/links", json=payload)
    assert r2.status_code == 409  # conta Pluggy já vinculada

    assert client.delete(f"/api/pluggy/links/{link_id}").status_code == 204
    assert client.delete(f"/api/pluggy/links/{link_id}").status_code == 404


def test_vinculo_valida_payload(client):
    base = {"item_id": "i", "pluggy_account_id": "a", "pluggy_type": "BANK",
            "account_id": 1, "sync_from": "2026-08-01"}
    assert client.post("/api/pluggy/links", json={**base, "pluggy_type": "X"}).status_code == 400
    assert client.post("/api/pluggy/links", json={**base, "account_id": 999}).status_code == 404
    assert client.post("/api/pluggy/links", json={**base, "sync_from": "16/08/2026"}).status_code == 400
