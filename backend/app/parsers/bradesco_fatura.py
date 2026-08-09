import re
from datetime import date, datetime

from app.normalize import extract_installment
from app.parsers import ParsedTransaction
from app.parsers.csv_generic import _fold, _to_cents

_ROW_RE = re.compile(r"^(\d{2})/(\d{2});")
_REF_RE = re.compile(r"^data:\s*(\d{2}/\d{2}/\d{4})")


def _decode(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("latin-1")


def sniff(content: bytes) -> bool:
    folded = _fold(_decode(content))
    return "valor(us$);valor(r$)" in folded and (
        "situacao da fatura" in folded or "total da fatura" in folded
    )


def _infer_date(day: int, month: int, ref: date) -> date | None:
    for year in (ref.year, ref.year - 1):
        try:
            d = date(year, month, day)
        except ValueError:
            continue
        if d <= ref:
            return d
    return None


def parse_bradesco_fatura(content: bytes) -> list[ParsedTransaction]:
    lines = [l for l in _decode(content).splitlines() if l.strip()]

    ref = None
    for line in lines:
        m = _REF_RE.match(_fold(line))
        if m:
            ref = datetime.strptime(m.group(1), "%d/%m/%Y").date()
            break
    if ref is None:
        raise ValueError("Fatura Bradesco sem data de referência (linha 'Data: dd/mm/aaaa')")

    rows: list[tuple[date, str, int]] = []
    for line in lines:
        m = _ROW_RE.match(line)
        if not m:
            continue
        parts = line.split(";")
        if len(parts) < 4:
            continue
        desc = parts[1].strip()
        if _fold(desc) == "saldo anterior":
            continue
        d = _infer_date(int(m.group(1)), int(m.group(2)), ref)
        if d is None:
            continue
        try:
            cents = -_to_cents(parts[3])
        except ValueError:
            continue
        rows.append((d, desc, cents))
    if not rows:
        raise ValueError("Fatura Bradesco sem linhas de transação válidas")

    # Nas linhas parceladas a fatura mostra a data da compra original, mas a
    # cobrança pertence ao ciclo desta fatura: parcelas fora da janela das
    # linhas regulares são datadas no início do ciclo. Sem linhas regulares
    # não há âncora e as datas ficam como estão.
    regular = [d for d, desc, _ in rows if extract_installment(desc) is None]
    if regular:
        start, end = min(regular), max(regular)
        rows = [
            (start if extract_installment(desc) and not start <= d <= end else d, desc, cents)
            for d, desc, cents in rows
        ]

    return [
        ParsedTransaction(date=d, description=desc, amount_cents=cents)
        for d, desc, cents in rows
    ]
