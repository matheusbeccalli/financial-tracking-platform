from datetime import date

from sqlalchemy import select

from app.models import Category, Rule, Transaction
from app.services.classifier import apply_correction, classify_new


def make_tx(session, desc, norm, cents=-1000):
    tx = Transaction(
        account_id=1, date=date(2026, 8, 1), description=desc, normalized=norm,
        amount_cents=cents, dedupe_hash=f"h-{norm}-{cents}",
    )
    session.add(tx)
    session.flush()
    return tx


def cat(session, name):
    return session.scalar(select(Category).where(Category.name == name))


def test_rule_classifies_without_llm(session):
    mercado = cat(session, "Mercado")
    session.add(Rule(matcher="SUPERMERCADO PAO DE ACUCAR", category_id=mercado.id))
    tx = make_tx(session, "SUPERMERCADO PAO DE ACUCAR 123", "SUPERMERCADO PAO DE ACUCAR")
    counts = classify_new(session, [tx], llm=None)
    assert tx.category_id == mercado.id and tx.source == "regra"
    assert counts == {"regra": 1, "llm": 0, "pendente": 0}


def test_unmatched_without_llm_stays_pending(session):
    tx = make_tx(session, "PIX QR CODE", "PIX QR CODE")
    counts = classify_new(session, [tx], llm=None)
    assert tx.category_id is None
    assert counts == {"regra": 0, "llm": 0, "pendente": 1}


def test_ignored_transactions_are_skipped(session):
    tx = make_tx(session, "PAGTO FATURA", "PAGTO FATURA")
    tx.ignored = True
    counts = classify_new(session, [tx], llm=None)
    assert counts == {"regra": 0, "llm": 0, "pendente": 0}


def test_correction_sets_manual_and_upserts_rule(session):
    lazer = cat(session, "Lazer")
    saude = cat(session, "Saúde")
    tx = make_tx(session, "DROGARIA XPTO", "DROGARIA XPTO")
    apply_correction(session, tx, lazer.id)
    assert tx.source == "manual" and tx.category_id == lazer.id
    apply_correction(session, tx, saude.id)  # segunda correção atualiza a regra
    rules = session.scalars(select(Rule).where(Rule.matcher == "DROGARIA XPTO")).all()
    assert len(rules) == 1 and rules[0].category_id == saude.id


def test_apply_ignore_creates_rule_and_retroapplies(session):
    from app.models import IgnoreRule
    from app.services.classifier import apply_ignore

    a = make_tx(session, "Transfe Pix Des: Eu 01/08", "TRANSFE PIX DES EU", cents=-1000)
    b = make_tx(session, "Transfe Pix Des: Eu 02/08", "TRANSFE PIX DES EU", cents=-2000)
    apply_ignore(session, a, True)
    session.flush()
    assert a.ignored is True and b.ignored is True
    assert session.scalar(
        select(IgnoreRule).where(IgnoreRule.matcher == "TRANSFE PIX DES EU")
    ) is not None

    apply_ignore(session, a, False)
    session.flush()
    assert a.ignored is False and b.ignored is False
    assert session.scalar(select(IgnoreRule)) is None
