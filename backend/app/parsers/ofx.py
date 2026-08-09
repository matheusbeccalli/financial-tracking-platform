from decimal import ROUND_HALF_UP, Decimal
from io import BytesIO

from ofxparse import OfxParser

from app.parsers import ParsedTransaction


def to_cents(amount) -> int:
    return int(
        (Decimal(str(amount)) * 100).to_integral_value(rounding=ROUND_HALF_UP)
    )


def parse_ofx(content: bytes) -> list[ParsedTransaction]:
    try:
        ofx = OfxParser.parse(BytesIO(content))
        out: list[ParsedTransaction] = []
        for account in ofx.accounts:
            for t in account.statement.transactions:
                description = (t.memo or t.payee or "").strip()
                out.append(
                    ParsedTransaction(
                        date=t.date.date(),
                        description=description,
                        amount_cents=to_cents(t.amount),
                    )
                )
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"OFX inválido: {e}") from e
    if not out:
        raise ValueError("OFX sem transações reconhecíveis")
    return out
