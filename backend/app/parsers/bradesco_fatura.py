import re
from datetime import date, datetime

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
    for year in (ref.year, ref.year - 1, ref.year - 2):
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

    out: list[ParsedTransaction] = []
    counts: dict[tuple[str, str, int], int] = {}
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
        key = (d.isoformat(), desc, cents)
        counts[key] = counts.get(key, 0) + 1
        out.append(
            ParsedTransaction(
                date=d,
                description=desc,
                amount_cents=cents,
                fitid=f"bradesco-fatura|{d.isoformat()}|{desc}|{cents}|{counts[key]}",
            )
        )
    if not out:
        raise ValueError("Fatura Bradesco sem linhas de transação válidas")
    return out
