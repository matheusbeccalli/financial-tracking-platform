from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class ParsedTransaction:
    date: date
    description: str
    amount_cents: int
    fitid: str | None = None


def parse_file(filename: str, content: bytes) -> list["ParsedTransaction"]:
    lower = filename.lower()
    if lower.endswith(".ofx"):
        from app.parsers.ofx import parse_ofx

        return parse_ofx(content)
    if lower.endswith(".csv"):
        from app.parsers.bradesco_fatura import parse_bradesco_fatura, sniff
        from app.parsers.csv_generic import parse_csv

        if sniff(content):
            return parse_bradesco_fatura(content)
        return parse_csv(content)
    raise ValueError(f"Formato não suportado: {filename} (use .ofx ou .csv)")
