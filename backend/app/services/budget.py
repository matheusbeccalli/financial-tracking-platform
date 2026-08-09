import calendar
from collections import defaultdict
from datetime import date

from sqlalchemy import select

from app.models import Budget, Category, Transaction
from app.normalize import name_sort_key


def budget_map(session, month: str) -> dict[int, int]:
    rows = session.scalars(
        select(Budget).where(Budget.valid_from <= month).order_by(Budget.valid_from)
    )
    out: dict[int, int] = {}
    for b in rows:  # valid_from mais recente sobrescreve
        out[b.category_id] = b.amount_cents
    return out


def month_bounds(month: str) -> tuple[date, date]:
    year, m = int(month[:4]), int(month[5:7])
    last = calendar.monthrange(year, m)[1]
    return date(year, m, 1), date(year, m, last)


def real_by_category(session, start: date, end: date) -> dict[int | str, int]:
    txs = session.scalars(
        select(Transaction).where(
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.ignored.is_(False),
        )
    )
    out: dict[int | str, int] = defaultdict(int)
    for t in txs:
        if t.category_id is None:
            key = "uncat_in" if t.amount_cents > 0 else "uncat_out"
        else:
            key = t.category_id
        out[key] += t.amount_cents
    return out


def month_summary(session, month: str, today: date | None = None) -> dict:
    start, end = month_bounds(month)
    today = today or date.today()
    cats = {c.id: c for c in session.scalars(select(Category))}
    bmap = budget_map(session, month)
    real = real_by_category(session, start, end)

    entradas_real = saidas_real = invest_real = 0
    for cat_id, cents in real.items():
        if cat_id in ("uncat_in", "uncat_out"):
            continue
        kind = cats[cat_id].kind
        if kind == "entrada":
            entradas_real += cents
        elif kind == "investimento":
            invest_real += -cents  # positivo = aportou mais do que resgatou
        else:
            saidas_real += -cents
    entradas_real += real.get("uncat_in", 0)
    saidas_real += -real.get("uncat_out", 0)
    entradas_orc = sum(v for cid, v in bmap.items() if cats[cid].kind == "entrada")
    saidas_orc = sum(v for cid, v in bmap.items() if cats[cid].kind == "saida")
    invest_orc = sum(v for cid, v in bmap.items() if cats[cid].kind == "investimento")

    # Dias decorridos do mês de referência: 0 se o mês ainda não começou,
    # mês inteiro se já terminou.
    if today < start:
        decorridos = 0
    elif today > end:
        decorridos = end.day
    else:
        decorridos = today.day

    # Ritmo em pontos percentuais: quanto do orçado já foi consumido menos
    # quanto do mês já passou. Negativo = folga.
    if saidas_orc > 0:
        ritmo = (saidas_real / saidas_orc) * 100 - (decorridos / end.day) * 100
    else:
        ritmo = None

    categorias = [
        {
            "id": c.id,
            "nome": c.name,
            "kind": c.kind,
            # investimento: líquido com sinal (negativo = resgatou mais);
            # demais: valor absoluto, como antes
            "real": -real.get(c.id, 0) if c.kind == "investimento" else abs(real.get(c.id, 0)),
            "orcado": bmap.get(c.id, 0),
        }
        for c in cats.values()
        if not c.archived and (c.id in real or c.id in bmap)
    ]
    return {
        "month": month,
        "entradas": {"real": entradas_real, "orcado": entradas_orc},
        "saidas": {"real": saidas_real, "orcado": saidas_orc},
        "investimentos": {"real": invest_real, "orcado": invest_orc},
        "saldo": {
            "real": entradas_real - saidas_real - invest_real,
            "orcado": entradas_orc - saidas_orc - invest_orc,
        },
        "ritmo": ritmo,
        "dias": {"decorridos": decorridos, "no_mes": end.day},
        "categorias": sorted(categorias, key=lambda c: (c["kind"], name_sort_key(c["nome"]))),
    }
