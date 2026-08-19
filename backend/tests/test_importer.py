from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models import ImportBatch, Transaction
from app.parsers import ParsedTransaction
from app.services.importer import import_file, import_parsed, undo_batch

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


def test_reimport_with_regenerated_fitids_is_deduplicated(session):
    """O Bradesco gera FITIDs novos a cada exportação do OFX; a deduplicação
    não pode confiar neles."""
    import_file(session, 1, "a.ofx", load("bradesco_conta.ofx"))
    session.commit()
    content = (
        load("bradesco_conta.ofx")
        .replace(b"N1001", b"X9001")
        .replace(b"N1002", b"X9002")
        .replace(b"N1003", b"X9003")
    )
    batch2, new2 = import_file(session, 1, "b.ofx", content)
    session.commit()
    assert batch2.new_count == 0 and batch2.dup_count == 3
    assert new2 == []
    assert session.scalar(select(func.count()).select_from(Transaction)) == 3


def test_identical_rows_in_one_file_are_kept_and_dedupe_on_reimport(session):
    """Duas compras iguais no mesmo dia são transações distintas; na
    reimportação (mesmo com FITIDs regenerados) ambas contam como duplicadas."""
    line = (
        b"<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260703<TRNAMT>-187.40"
        b"<FITID>N1001<MEMO>SUPERMERCADO PAO DE ACUCAR 123456</STMTTRN>"
    )
    twin = line.replace(b"N1001", b"N1004")
    content = load("bradesco_conta.ofx").replace(line, line + b"\n" + twin)
    batch, _ = import_file(session, 1, "a.ofx", content)
    session.commit()
    assert batch.new_count == 4 and batch.dup_count == 0
    batch2, _ = import_file(session, 1, "b.ofx", content.replace(b"N100", b"X900"))
    session.commit()
    assert batch2.new_count == 0 and batch2.dup_count == 4
    assert session.scalar(select(func.count()).select_from(Transaction)) == 4


def test_hash_uses_raw_description_so_installments_stay_distinct(session):
    """Parcelas em faturas consecutivas têm a mesma data e valor, diferindo só
    no sufixo cru ("1/10" vs "2/10") — que a normalização apaga. O hash precisa
    da descrição crua para não colapsá-las."""
    line = (
        b"<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260703<TRNAMT>-187.40"
        b"<FITID>N1001<MEMO>SUPERMERCADO PAO DE ACUCAR 123456</STMTTRN>"
    )
    a = line.replace(b"SUPERMERCADO PAO DE ACUCAR 123456", b"LOJA X 1/10")
    b = a.replace(b"1/10", b"2/10").replace(b"N1001", b"N1004")
    content = load("bradesco_conta.ofx").replace(line, a + b"\n" + b)
    batch, _ = import_file(session, 1, "a.ofx", content)
    session.commit()
    assert batch.new_count == 4 and batch.dup_count == 0
    batch2, _ = import_file(session, 1, "b.ofx", content)
    session.commit()
    assert batch2.new_count == 0 and batch2.dup_count == 4


def test_extra_occurrence_in_new_file_is_imported(session):
    """Base com 2 ocorrências de uma chave; arquivo novo traz 3: a terceira é
    compra nova, as duas primeiras são duplicadas."""
    line = (
        b"<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260703<TRNAMT>-187.40"
        b"<FITID>N1001<MEMO>SUPERMERCADO PAO DE ACUCAR 123456</STMTTRN>"
    )
    twin = line.replace(b"N1001", b"N1004")
    triplet = line.replace(b"N1001", b"N1005")
    two = load("bradesco_conta.ofx").replace(line, line + b"\n" + twin)
    three = load("bradesco_conta.ofx").replace(
        line, line + b"\n" + twin + b"\n" + triplet
    )
    import_file(session, 1, "a.ofx", two)
    session.commit()
    batch2, new2 = import_file(session, 1, "b.ofx", three)
    session.commit()
    assert batch2.new_count == 1 and batch2.dup_count == 4
    assert len(new2) == 1 and new2[0].amount_cents == -18740


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


def test_card_payment_credit_is_ignored(session):
    import_file(session, 4, "b.ofx", load("inter_cartao.ofx"))
    session.commit()
    pagamento = session.scalar(
        select(Transaction).where(Transaction.amount_cents == 230000)
    )
    assert pagamento.ignored is True


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


def test_gasto_c_credito_is_ignored(session):
    content = load("bradesco_conta.ofx").replace(b"PAGTO FATURA CARTAO", b"Gasto c Credito")
    import_file(session, 1, "a.ofx", content)
    session.commit()
    tx = session.scalar(select(Transaction).where(Transaction.normalized == "GASTO C CREDITO"))
    assert tx.ignored is True


def test_ignore_rule_applies_on_import(session):
    from app.models import IgnoreRule

    session.add(IgnoreRule(matcher="SUPERMERCADO PAO DE ACUCAR"))
    session.flush()
    import_file(session, 1, "a.ofx", load("bradesco_conta.ofx"))
    session.commit()
    tx = session.scalar(select(Transaction).where(Transaction.amount_cents == -18740))
    assert tx.ignored is True


def test_import_parsed_accepts_prebuilt_transactions(session):
    """Ponto de entrada do futuro conector Pluggy: transações já parseadas."""
    from datetime import date

    from app.parsers import ParsedTransaction
    from app.services.importer import import_parsed

    parsed = [
        ParsedTransaction(date=date(2026, 7, 1), description="LOJA A", amount_cents=-1000),
        ParsedTransaction(date=date(2026, 7, 2), description="LOJA B", amount_cents=-2000),
    ]
    batch, new = import_parsed(session, 1, "pluggy", "pluggy", parsed)
    session.commit()
    assert batch.new_count == 2 and batch.dup_count == 0
    assert len(new) == 2 and batch.source == "pluggy"


def test_import_preenche_parcela_via_regex(session):
    parsed = [
        ParsedTransaction(date=date(2026, 7, 5), description="LOJA X PARC 02/10", amount_cents=-4500)
    ]
    _, new = import_parsed(session, 2, "f.csv", "csv", parsed)
    assert new[0].installment == "02/10"
    assert (new[0].installment_number, new[0].installment_total) == (2, 10)


def test_import_usa_campos_estruturados_do_parsed():
    """Campos vindos do conector (Pluggy) ganham da regex e derivam a string NN/TT."""
    p = ParsedTransaction(
        date=date(2026, 7, 5), description="LOJA Y", amount_cents=-4500,
        installment_number=3, installment_total=6,
    )
    assert (p.installment_number, p.installment_total) == (3, 6)


def test_import_grava_campos_estruturados(session):
    parsed = [
        ParsedTransaction(
            date=date(2026, 7, 6), description="LOJA Y", amount_cents=-4500,
            installment_number=3, installment_total=6,
        )
    ]
    _, new = import_parsed(session, 2, "pluggy", "pluggy", parsed)
    assert new[0].installment == "03/06"
    assert (new[0].installment_number, new[0].installment_total) == (3, 6)


def test_import_sem_parcela_fica_none(session):
    parsed = [ParsedTransaction(date=date(2026, 7, 7), description="PADARIA", amount_cents=-1000)]
    _, new = import_parsed(session, 2, "f.csv", "csv", parsed)
    assert new[0].installment is None
    assert new[0].installment_number is None
    assert new[0].installment_total is None
