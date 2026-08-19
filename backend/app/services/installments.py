"""Projeção de parcelamentos de cartão (spec 2026-08-18).

Cada transação parcelada do mês de referência é uma série ativa: toda série
tem exatamente uma parcela por fatura mensal, então um único mês fechado
captura todas. Restam (total − numero) parcelas, uma por mês, mesmo valor.
"""
from sqlalchemy import select

from app.models import Account, Category, Transaction
from app.normalize import name_sort_key
from app.services.budget import budget_map, month_bounds

# risco quando parcelas >= 80% do orçado (inteiros: parcelas*5 >= orcado*4)
RISK_NUM, RISK_DEN = 4, 5


def add_months(month: str, delta: int) -> str:
    y, m = int(month[:4]), int(month[5:7])
    total = y * 12 + (m - 1) + delta
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def _status(parcelas: int, orcado: int | None) -> str:
    if parcelas == 0 or orcado is None:
        return "ok"
    if parcelas > orcado:
        return "estouro"
    if parcelas * RISK_DEN >= orcado * RISK_NUM:
        return "risco"
    return "ok"


def installments_projection(session, month: str) -> dict:
    start, end = month_bounds(month)
    txs = list(
        session.scalars(
            select(Transaction)
            .join(Account, Transaction.account_id == Account.id)
            .where(
                Account.kind == "cartao",
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.ignored.is_(False),
                Transaction.installment_number.is_not(None),
                Transaction.installment_total.is_not(None),
                Transaction.amount_cents < 0,
            )
            .order_by(Transaction.date, Transaction.id)
        )
    )
    accounts = {a.id: a.name for a in session.scalars(select(Account))}
    cats = {c.id: c for c in session.scalars(select(Category))}

    horizon = max((t.installment_total - t.installment_number for t in txs), default=0)
    months = [add_months(month, i) for i in range(1, horizon + 1)]
    bmaps = [budget_map(session, m) for m in months]

    series: list[dict] = []
    by_cat: dict[int | None, list[int]] = {}
    for t in txs:
        remaining = t.installment_total - t.installment_number
        valor = -t.amount_cents
        series.append({
            "tx_id": t.id,
            "descricao": t.description,
            "conta": accounts[t.account_id],
            "categoria_id": t.category_id,
            "categoria_nome": cats[t.category_id].name if t.category_id else None,
            "numero": t.installment_number,
            "total": t.installment_total,
            "valor": valor,
            "termina_em": add_months(month, remaining),
            "restante": valor * remaining,
        })
        if remaining:
            row = by_cat.setdefault(t.category_id, [0] * horizon)
            for i in range(remaining):
                row[i] += valor

    def cat_key(cid: int | None):
        return (cid is None, name_sort_key(cats[cid].name) if cid is not None else "")

    categorias = []
    for cid in sorted(by_cat, key=cat_key):
        parcelas = by_cat[cid]
        orcado = [bmaps[i].get(cid) if cid is not None else None for i in range(horizon)]
        categorias.append({
            "id": cid,
            "nome": cats[cid].name if cid is not None else "Sem categoria",
            "parcelas": parcelas,
            "orcado": orcado,
            "status": [_status(parcelas[i], orcado[i]) for i in range(horizon)],
        })

    totais = [sum(c["parcelas"][i] for c in categorias) for i in range(horizon)]
    series.sort(key=lambda s: -s["restante"])
    return {
        "month": month,
        "months": months,
        "categorias": categorias,
        "totais": totais,
        "series": series,
    }
