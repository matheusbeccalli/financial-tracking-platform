import csv
import io
import re
import unicodedata
from datetime import datetime

from app.parsers import ParsedTransaction

DESC_KEYS = ("descri", "historico", "lancamento", "titulo")


def _fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def _to_cents(raw: str) -> int:
    s = raw.strip().replace("R$", "").replace(" ", "")
    s = s.replace(".", "").replace(",", ".")
    return int(round(float(s) * 100))


def _decode(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("latin-1")


def parse_csv(content: bytes) -> list[ParsedTransaction]:
    text = _decode(content)
    lines = [l for l in text.splitlines() if l.strip()]

    header_idx = None
    for i, line in enumerate(lines):
        folded = _fold(line)
        if "data" in folded and "valor" in folded:
            header_idx = i
            break
    if header_idx is None:
        raise ValueError("CSV sem cabeçalho reconhecível (esperado colunas Data e Valor)")

    delimiter = ";" if ";" in lines[header_idx] else ","
    rows = list(csv.reader(io.StringIO("\n".join(lines[header_idx:])), delimiter=delimiter))
    header = [_fold(h) for h in rows[0]]

    def col(*keys):
        for i, h in enumerate(header):
            if any(k in h for k in keys):
                return i
        return None

    i_date, i_val = col("data"), col("valor")
    i_desc = col(*DESC_KEYS)
    if i_desc is None:
        raise ValueError("CSV sem coluna de descrição/histórico")

    out: list[ParsedTransaction] = []
    for row in rows[1:]:
        if len(row) <= max(i_date, i_val, i_desc):
            continue
        raw_date = row[i_date].strip()
        if not re.match(r"\d{2}/\d{2}/\d{4}$", raw_date):
            continue
        out.append(
            ParsedTransaction(
                date=datetime.strptime(raw_date, "%d/%m/%Y").date(),
                description=row[i_desc].strip(),
                amount_cents=_to_cents(row[i_val]),
            )
        )
    if not out:
        raise ValueError("CSV sem linhas de transação válidas")
    return out
