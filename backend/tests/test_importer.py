from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models import ImportBatch, Transaction
from app.services.importer import import_file, undo_batch

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_import_creates_transactions_and_batch(session):
    batch, new = import_file(session, 1, "bradesco_conta.ofx", load("bradesco_conta.ofx"))
    session.commit()
    assert batch.new_count == 3 and batch.dup_count == 0
    assert len(new) == 3
    tx = session.scalar(select(Transaction).where(Transaction.amount_cents == -18740))
    assert tx.normalized == "SUPERMERCADO PAO DE ACUCAR"
    assert tx.category_id is None and tx.source is None


def test_reimport_is_fully_deduplicated(session):
    import_file(session, 1, "a.ofx", load("bradesco_conta.ofx"))
    session.commit()
    batch2, new2 = import_file(session, 1, "b.ofx", load("bradesco_conta.ofx"))
    session.commit()
    assert batch2.new_count == 0 and batch2.dup_count == 3
    assert new2 == []
    assert session.scalar(select(func.count()).select_from(Transaction)) == 3


def test_fatura_payment_is_ignored_and_installment_extracted(session):
    import_file(session, 1, "a.ofx", load("bradesco_conta.ofx"))
    import_file(session, 4, "b.ofx", load("inter_cartao.ofx"))
    session.commit()
    fatura = session.scalar(
        select(Transaction).where(Transaction.normalized.contains("PAGTO FATURA"))
    )
    assert fatura.ignored is True
    renner = session.scalar(
        select(Transaction).where(Transaction.normalized.contains("RENNER"))
    )
    assert renner.installment == "02/04" and renner.ignored is False


def test_invalid_file_writes_nothing(session):
    with pytest.raises(ValueError):
        import_file(session, 1, "x.ofx", b"lixo")
    session.rollback()
    assert session.scalar(select(func.count()).select_from(ImportBatch)) == 0


def test_undo_batch_removes_its_transactions(session):
    batch, _ = import_file(session, 1, "a.ofx", load("bradesco_conta.ofx"))
    session.commit()
    undo_batch(session, batch.id)
    session.commit()
    assert session.scalar(select(func.count()).select_from(Transaction)) == 0
    assert session.get(ImportBatch, batch.id) is None
