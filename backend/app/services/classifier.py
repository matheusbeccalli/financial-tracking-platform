from sqlalchemy import select

from app.models import Category, Rule, Transaction

LLM_BATCH_SIZE = 50


def classify_new(session, txs: list[Transaction], llm) -> dict[str, int]:
    counts = {"regra": 0, "llm": 0, "pendente": 0}
    pending: list[Transaction] = []
    for tx in txs:
        if tx.ignored or tx.category_id is not None:
            continue
        rule = session.scalar(select(Rule).where(Rule.matcher == tx.normalized))
        if rule:
            tx.category_id, tx.source = rule.category_id, "regra"
            counts["regra"] += 1
        else:
            pending.append(tx)

    if pending and llm is not None:
        by_name = {
            c.name: c.id
            for c in session.scalars(select(Category).where(~Category.archived))
        }
        names = list(by_name)
        for i in range(0, len(pending), LLM_BATCH_SIZE):
            chunk = pending[i : i + LLM_BATCH_SIZE]
            items = [
                {"id": t.id, "descricao": t.description, "valor_centavos": t.amount_cents}
                for t in chunk
            ]
            result = llm.classify(items, names)  # dict[tx_id, nome_categoria]
            for t in chunk:
                name = result.get(t.id)
                if name in by_name:
                    t.category_id, t.source = by_name[name], "llm"
                    counts["llm"] += 1
                else:
                    counts["pendente"] += 1
    else:
        counts["pendente"] += len(pending)
    return counts


def apply_correction(session, tx: Transaction, category_id: int) -> None:
    tx.category_id, tx.source = category_id, "manual"
    if not tx.normalized:
        return
    rule = session.scalar(select(Rule).where(Rule.matcher == tx.normalized))
    if rule:
        rule.category_id = category_id
    else:
        session.add(Rule(matcher=tx.normalized, category_id=category_id))
