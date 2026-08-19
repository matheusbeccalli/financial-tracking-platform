"""Suspeita de duplicata na API de transações."""
from datetime import date

from app.models import ImportBatch, Transaction


def seed_par(session):
    """Devolve (velha do OFX, nova da Pluggy marcada como suspeita)."""
    b1 = ImportBatch(source="ofx", filename="Bradesco_14082026.ofx")
    b2 = ImportBatch(source="pluggy", filename="Pluggy · Bradesco Conta · 2026-08-17")
    session.add_all([b1, b2])
    session.flush()
    velha = Transaction(
        account_id=1, date=date(2026, 8, 13),
        description="Cartao Visa Electron D.b. Ortho Servic",
        normalized="CARTAO VISA ELECTRON D B ORTHO SERVIC",
        amount_cents=-170000, dedupe_hash="h-velha", batch_id=b1.id,
    )
    session.add(velha)
    session.flush()
    nova = Transaction(
        account_id=1, date=date(2026, 8, 13),
        description="COMPRA CARTAO VISA - D.B. ORTHO SERVIC - DOCTO: 189385",
        normalized="COMPRA CARTAO VISA D B ORTHO SERVIC DOCTO",
        amount_cents=-170000, dedupe_hash="h-nova", batch_id=b2.id,
        duplicate_of_id=velha.id,
    )
    session.add(nova)
    session.commit()
    return velha, nova


def linha(client, tx_id, month="2026-08"):
    body = client.get(f"/api/transactions?month={month}").json()
    return next(t for t in body if t["id"] == tx_id)


def test_lista_traz_a_gemea_resolvida(client, session):
    velha, nova = seed_par(session)
    t = linha(client, nova.id)
    assert t["duplicate_of_id"] == velha.id
    assert t["duplicate_of"] == {
        "id": velha.id,
        "date": "2026-08-13",
        "description": "Cartao Visa Electron D.b. Ortho Servic",
        "origin": "ofx",
    }


def test_linha_sem_suspeita_vem_com_campos_nulos(client, session):
    velha, _ = seed_par(session)
    t = linha(client, velha.id)
    assert t["duplicate_of_id"] is None
    assert t["duplicate_of"] is None


def test_delete_apaga_a_transacao(client, session):
    _, nova = seed_par(session)
    assert client.delete(f"/api/transactions/{nova.id}").status_code == 204
    ids = [t["id"] for t in client.get("/api/transactions?month=2026-08").json()]
    assert nova.id not in ids


def test_delete_da_gemea_limpa_a_marca_da_outra(client, session):
    velha, nova = seed_par(session)
    assert client.delete(f"/api/transactions/{velha.id}").status_code == 204
    t = linha(client, nova.id)
    assert t["duplicate_of_id"] is None
    assert t["duplicate_of"] is None


def test_delete_inexistente_404(client):
    assert client.delete("/api/transactions/9999").status_code == 404


def test_not_duplicate_tira_a_marca_sem_apagar(client, session):
    _, nova = seed_par(session)
    r = client.post(f"/api/transactions/{nova.id}/not-duplicate")
    assert r.status_code == 200
    assert r.json()["duplicate_of_id"] is None
    t = linha(client, nova.id)
    assert t["duplicate_of_id"] is None


def test_not_duplicate_inexistente_404(client):
    assert client.post("/api/transactions/9999/not-duplicate").status_code == 404
