from sqlalchemy import delete, select

from app.dedupe import make_hash
from app.models import IgnoreRule, ImportBatch, Transaction
from app.normalize import extract_installment, normalize_description
from app.parsers import parse_file

# Conservador de propósito: só o que é certamente dupla contagem.
# Transferências entre contas próprias não-óbvias são marcadas à mão na UI.
IGNORE_PATTERNS = (
    "PAGTO FATURA",
    "PGTO FATURA",
    "PAGAMENTO FATURA",
    "PAGAMENTO DE FATURA",
    "PAGTO CARTAO CREDITO",
    "GASTO C CREDITO",
    "TRANSFERENCIA ENTRE CONTAS",
    "PAGAMENTO ON LINE",
    "PAGAMENTO ONLINE",
    "PAGTO POR DEB",
    "PAGAMENTO RECEBIDO",
    "PAGAMENTO EFETUADO",
    "PAGAMENTO DEB EM CONTA",
)


def import_file(
    session, account_id: int, filename: str, content: bytes
) -> tuple[ImportBatch, list[Transaction]]:
    parsed = parse_file(filename, content)  # ValueError => nada foi escrito
    source = "csv" if filename.lower().endswith(".csv") else "ofx"
    batch = ImportBatch(source=source, filename=filename)
    session.add(batch)
    session.flush()

    ignore_matchers = {r.matcher for r in session.scalars(select(IgnoreRule))}
    new: list[Transaction] = []
    for p in parsed:
        h = make_hash(account_id, p.fitid, p.date, p.amount_cents, p.description)
        exists = session.scalar(select(Transaction.id).where(Transaction.dedupe_hash == h))
        if exists:
            batch.dup_count += 1
            continue
        norm = normalize_description(p.description)
        tx = Transaction(
            account_id=account_id,
            date=p.date,
            description=p.description,
            normalized=norm,
            amount_cents=p.amount_cents,
            dedupe_hash=h,
            batch_id=batch.id,
            installment=extract_installment(p.description),
            ignored=any(pat in norm for pat in IGNORE_PATTERNS)
            or norm in ignore_matchers,
        )
        session.add(tx)
        new.append(tx)
        batch.new_count += 1
    session.flush()
    return batch, new


def undo_batch(session, batch_id: int) -> None:
    session.execute(delete(Transaction).where(Transaction.batch_id == batch_id))
    batch = session.get(ImportBatch, batch_id)
    if batch:
        session.delete(batch)
