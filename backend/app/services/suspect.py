"""Suspeita de duplicata entre origens.

O dedupe_hash inclui a descrição (app/dedupe.py), e o mesmo lançamento chega
com texto diferente conforme a origem — OFX, CSV de fatura e Pluggy. Aqui
procuramos, para cada linha nova, uma já existente com a mesma conta e o mesmo
valor numa janela de dias. Nada é apagado nem escondido: quem decide é o
usuário, porque a regra tem falso positivo possível (dois lançamentos
legítimos de mesmo valor em dias próximos).
"""
from datetime import timedelta

from sqlalchemy import select

from app.models import Transaction
from app.normalize import parse_installment

WINDOW_DAYS = 3  # a Pluggy chega a datar o mesmo lançamento 1 dia depois do OFX


def _parcela(t: Transaction) -> tuple[int, int] | None:
    """(nº, total) da parcela. Cai na string para linhas gravadas antes das
    colunas numéricas existirem — lá o formato era `1/10`, hoje é `01/10`."""
    if t.installment_number is not None and t.installment_total is not None:
        return (t.installment_number, t.installment_total)
    return parse_installment(t.installment)


def _parcelas_diferentes(a: Transaction, b: Transaction) -> bool:
    """Parcelas distintas da mesma compra dividem data e valor, e não são
    duplicata: `HUGO BOSS 1/10` na fatura de um mês e `2/10` na do mês seguinte.
    Compara os números, nunca o texto: os dois formatos convivem no banco."""
    pa, pb = _parcela(a), _parcela(b)
    return bool(pa and pb and pa != pb)


def find_twin(session, tx: Transaction, taken: set[int]) -> Transaction | None:
    """Transação que `tx` provavelmente duplica, ou None.

    Candidata: mesma conta, mesmo valor, até WINDOW_DAYS de diferença, de outro
    lote, ainda sem marca própria e ainda não reclamada nesta rodada (`taken`).
    Vence a de data mais próxima; empate resolve pelo menor id.
    """
    stmt = select(Transaction).where(
        Transaction.id != tx.id,
        Transaction.account_id == tx.account_id,
        Transaction.amount_cents == tx.amount_cents,
        Transaction.date >= tx.date - timedelta(days=WINDOW_DAYS),
        Transaction.date <= tx.date + timedelta(days=WINDOW_DAYS),
        # is_distinct_from e não `!=`: linha sem lote (batch_id NULL) some da
        # busca com `!=`, e sem lote ela nunca é "o mesmo arquivo".
        Transaction.batch_id.is_distinct_from(tx.batch_id),
        Transaction.duplicate_of_id.is_(None),
    )
    candidatas = [
        c
        for c in session.scalars(stmt)
        if c.id not in taken and not _parcelas_diferentes(c, tx)
    ]
    if not candidatas:
        return None
    return min(candidatas, key=lambda c: (abs((c.date - tx.date).days), c.id))


def mark_suspects(session, new: list[Transaction]) -> int:
    """Marca as linhas novas que parecem duplicar alguma existente.

    Precisa rodar depois do flush do lote: a busca é no banco, e sem id as
    linhas novas não se excluem umas às outras.
    """
    taken: set[int] = set()
    marcadas = 0
    for tx in new:
        twin = find_twin(session, tx, taken)
        if twin is None:
            continue
        tx.duplicate_of_id = twin.id
        taken.add(twin.id)
        marcadas += 1
    return marcadas
