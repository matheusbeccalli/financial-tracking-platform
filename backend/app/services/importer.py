from sqlalchemy import delete, select, update

from app.dedupe import make_hash
from app.models import IgnoreRule, ImportBatch, Transaction
from app.normalize import extract_installment, normalize_description, parse_installment
from app.parsers import parse_file
from app.services.suspect import mark_suspects

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
    return import_parsed(session, account_id, filename, source, parsed)


def import_parsed(
    session, account_id: int, filename: str, source: str, parsed
) -> tuple[ImportBatch, list[Transaction]]:
    """Grava transações já parseadas — ponto de entrada de conectores (Pluggy)."""
    batch = ImportBatch(source=source, filename=filename)
    session.add(batch)
    session.flush()

    ignore_matchers = {r.matcher for r in session.scalars(select(IgnoreRule))}
    new: list[Transaction] = []
    seen: dict[tuple, int] = {}
    for p in parsed:
        key = (p.date, p.amount_cents, p.description.strip().upper())
        seen[key] = seen.get(key, 0) + 1
        h = make_hash(account_id, p.date, p.amount_cents, p.description, seen[key])
        exists = session.scalar(select(Transaction.id).where(Transaction.dedupe_hash == h))
        if exists:
            batch.dup_count += 1
            continue
        norm = normalize_description(p.description)
        num, tot = p.installment_number, p.installment_total
        if num is not None and tot is not None:
            inst = f"{num:02d}/{tot:02d}"  # badge da UI usa a string
        else:
            inst = extract_installment(p.description)
            num, tot = parse_installment(inst) or (None, None)
        tx = Transaction(
            account_id=account_id,
            date=p.date,
            description=p.description,
            normalized=norm,
            amount_cents=p.amount_cents,
            dedupe_hash=h,
            batch_id=batch.id,
            installment=inst,
            installment_number=num,
            installment_total=tot,
            ignored=any(pat in norm for pat in IGNORE_PATTERNS)
            or norm in ignore_matchers,
        )
        session.add(tx)
        new.append(tx)
        batch.new_count += 1
    session.flush()  # ids das novas: mark_suspects consulta o banco
    mark_suspects(session, new)
    return batch, new


def undo_batch(session, batch_id: int) -> None:
    # Sem isto sobraria marca órfã: quem apontava para uma linha do lote ficaria
    # com duplicate_of_id de id inexistente — some do badge e conta no filtro.
    apagadas = select(Transaction.id).where(Transaction.batch_id == batch_id)
    session.execute(
        update(Transaction)
        .where(Transaction.duplicate_of_id.in_(apagadas))
        .values(duplicate_of_id=None)
    )
    session.execute(delete(Transaction).where(Transaction.batch_id == batch_id))
    batch = session.get(ImportBatch, batch_id)
    if batch:
        session.delete(batch)
