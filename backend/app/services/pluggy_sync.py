"""Sync Pluggy → import_parsed(). A Pluggy só muda a origem: dedupe, regras
de ignorar e classificação LLM são os mesmos do import por arquivo."""
from datetime import date

from app.parsers import ParsedTransaction


def to_parsed(raw: list[dict], pluggy_type: str) -> tuple[list[ParsedTransaction], int]:
    """Converte transações da Pluggy. Retorna (parsed, puladas_por_moeda).

    - PENDING fica de fora (pode mudar ao postar; o overlap do próximo sync pega).
    - Moeda ≠ BRL é pulada e contada (spec: reportar).
    - Sinal: BANK já vem como o nosso (negativo = saída); CREDIT vem invertido
      (positivo = compra) → inverte. Validar com dados reais (ponto de atenção).
    """
    parsed: list[ParsedTransaction] = []
    skipped_currency = 0
    for t in raw:
        if t.get("status") == "PENDING":
            continue
        if t.get("currencyCode", "BRL") != "BRL":
            skipped_currency += 1
            continue
        cents = round(t["amount"] * 100)
        if pluggy_type == "CREDIT":
            cents = -cents
        parsed.append(
            ParsedTransaction(
                date=date.fromisoformat(t["date"][:10]),
                description=t.get("descriptionRaw") or t["description"],
                amount_cents=cents,
            )
        )
    return parsed, skipped_currency
