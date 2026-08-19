from datetime import date

from sqlalchemy import select

from app.models import Account, Budget, Category, Transaction
from app.services.installments import _status, add_months, installments_projection

REF = "2026-07"


def cartao_id(session) -> int:
    return session.scalar(select(Account.id).where(Account.kind == "cartao"))


def corrente_id(session) -> int:
    return session.scalar(select(Account.id).where(Account.kind == "corrente"))


def cat_id(session, name: str) -> int:
    return session.scalar(select(Category.id).where(Category.name == name))


_seq = 0


def add_tx(session, account_id, desc, cents, num=None, tot=None, cat=None,
           ignored=False, d=date(2026, 7, 15)):
    global _seq
    _seq += 1
    tx = Transaction(
        account_id=account_id, date=d, description=desc, normalized=desc.upper(),
        amount_cents=cents, category_id=cat, dedupe_hash=f"h{_seq}",
        installment=f"{num:02d}/{tot:02d}" if num else None,
        installment_number=num, installment_total=tot, ignored=ignored,
    )
    session.add(tx)
    session.flush()
    return tx


def test_add_months():
    assert add_months("2026-07", 1) == "2026-08"
    assert add_months("2026-12", 1) == "2027-01"
    assert add_months("2026-07", 7) == "2027-02"


def test_status_limiares():
    assert _status(0, 0) == "ok"          # celula vazia nunca alerta
    assert _status(100, None) == "ok"     # sem orcamento no mes
    assert _status(39999, 50000) == "ok"
    assert _status(40000, 50000) == "risco"    # exatamente 80%
    assert _status(50000, 50000) == "risco"    # igual ao orcado ainda cabe
    assert _status(50001, 50000) == "estouro"


def test_projeta_serie_basica(session):
    mercado = cat_id(session, "Mercado")
    add_tx(session, cartao_id(session), "MAGALU 03/10", -45000, num=3, tot=10, cat=mercado)
    out = installments_projection(session, REF)
    assert out["months"] == [add_months(REF, i) for i in range(1, 8)]  # 7 restantes
    linha = out["categorias"][0]
    assert linha["nome"] == "Mercado"
    assert linha["parcelas"] == [45000] * 7
    assert out["totais"] == [45000] * 7
    s = out["series"][0]
    assert (s["numero"], s["total"], s["valor"]) == (3, 10, 45000)
    assert s["termina_em"] == "2027-02"
    assert s["restante"] == 45000 * 7


def test_ultima_parcela_aparece_mas_nao_projeta(session):
    add_tx(session, cartao_id(session), "LOJA 10/10", -10000, num=10, tot=10)
    out = installments_projection(session, REF)
    assert out["months"] == []
    assert out["categorias"] == []
    assert out["series"][0]["restante"] == 0
    assert out["series"][0]["termina_em"] == REF


def test_filtros(session):
    # conta corrente (falso positivo de Pix), ignorada e estorno positivo ficam fora
    add_tx(session, corrente_id(session), "PIX ATS PNEUS 02/07", -5000, num=2, tot=7)
    add_tx(session, cartao_id(session), "IGNORADA 02/05", -5000, num=2, tot=5, ignored=True)
    add_tx(session, cartao_id(session), "ESTORNO 02/05", 5000, num=2, tot=5)
    out = installments_projection(session, REF)
    assert out["series"] == []
    assert out["months"] == []


def test_orcamento_vigencia_e_status(session):
    mercado = cat_id(session, "Mercado")
    session.add(Budget(category_id=mercado, amount_cents=100000, valid_from="2026-01"))
    session.add(Budget(category_id=mercado, amount_cents=40000, valid_from="2026-10"))
    add_tx(session, cartao_id(session), "SOFA 01/06", -45000, num=1, tot=6, cat=mercado)
    out = installments_projection(session, REF)
    linha = out["categorias"][0]
    assert out["months"] == ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]
    assert linha["orcado"] == [100000, 100000, 40000, 40000, 40000]
    assert linha["status"] == ["ok", "ok", "estouro", "estouro", "estouro"]


def test_sem_categoria(session):
    session.add(Budget(category_id=cat_id(session, "Mercado"), amount_cents=100, valid_from="2026-01"))
    add_tx(session, cartao_id(session), "AVULSA 01/03", -30000, num=1, tot=3, cat=None)
    out = installments_projection(session, REF)
    linha = out["categorias"][0]
    assert linha["id"] is None
    assert linha["nome"] == "Sem categoria"
    assert linha["orcado"] == [None, None]
    assert linha["status"] == ["ok", "ok"]


def test_agrega_duas_series_na_mesma_categoria(session):
    mercado = cat_id(session, "Mercado")
    # A: restam 2 parcelas (ago, set), restante 20000; B: resta 1 (ago), restante 25000
    add_tx(session, cartao_id(session), "A 01/03", -10000, num=1, tot=3, cat=mercado)
    add_tx(session, cartao_id(session), "B 02/03", -25000, num=2, tot=3, cat=mercado)
    out = installments_projection(session, REF)
    linha = out["categorias"][0]
    assert out["months"] == ["2026-08", "2026-09"]
    assert linha["parcelas"] == [35000, 10000]
    assert out["totais"] == [35000, 10000]
    # serie de maior restante primeiro
    assert out["series"][0]["descricao"] == "B 02/03"


def test_mes_sem_parcelas(session):
    out = installments_projection(session, REF)
    assert out == {"month": REF, "months": [], "categorias": [], "totais": [], "series": []}
