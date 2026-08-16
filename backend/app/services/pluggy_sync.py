"""Sync Pluggy → import_parsed(). A Pluggy só muda a origem: dedupe, regras
de ignorar e classificação LLM são os mesmos do import por arquivo."""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.models import Account, PluggyLink
from app.parsers import ParsedTransaction
from app.services.importer import import_parsed
from app.services.pluggy import PluggyError


def to_parsed(raw: list[dict], pluggy_type: str) -> tuple[list[ParsedTransaction], int]:
    """Converte transações da Pluggy. Retorna (parsed, puladas_por_moeda).

    - PENDING fica de fora (pode mudar ao postar; pending_since segura a janela
      do próximo sync até ela postar, para não se perder com a data original).
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


def oldest_pending(raw: list[dict]) -> date | None:
    """Menor data entre as PENDING do lote — None se não houver nenhuma."""
    dates = [
        date.fromisoformat(t["date"][:10])
        for t in raw
        if t.get("status") == "PENDING"
    ]
    return min(dates) if dates else None


OVERLAP_DAYS = 3  # lançamentos publicados com atraso; dedupe segura os repetidos


def sync_all(session, client, today: date | None = None) -> list[dict]:
    """Sincroniza todos os vínculos. Falha em um não aborta os outros.

    Retorna, por vínculo: {"link_id", "account", "batch", "new", "skipped_currency"}
    ou {"link_id", "account", "error"}. Quem chama commita.
    """
    today = today or date.today()
    results: list[dict] = []
    for link in session.scalars(select(PluggyLink).order_by(PluggyLink.id)):
        account = session.get(Account, link.account_id)
        start = link.sync_from
        if link.last_synced_at is not None:
            floor = link.last_synced_at.date() - timedelta(days=OVERLAP_DAYS)
            if link.pending_since is not None:
                floor = min(floor, link.pending_since)
            start = max(start, floor)
        try:
            raw = client.get_transactions(link.pluggy_account_id, start, today)
            parsed, skipped = to_parsed(raw, link.pluggy_type)
            pend = oldest_pending(raw)
        except PluggyError as e:
            results.append({"link_id": link.id, "account": account.name, "error": str(e)})
            continue
        except (KeyError, ValueError, TypeError) as e:
            results.append({
                "link_id": link.id,
                "account": account.name,
                "error": f"Resposta inesperada da Pluggy: {e!r}",
            })
            continue
        parsed = [p for p in parsed if p.date >= link.sync_from]  # invariante da spec
        filename = f"Pluggy · {account.name} · {today.isoformat()}"
        batch, new = import_parsed(session, link.account_id, filename, "pluggy", parsed)
        # naive UTC, mesma convenção do imported_at (server_default now() do SQLite)
        link.last_synced_at = datetime.now(timezone.utc).replace(tzinfo=None)
        link.pending_since = pend
        results.append({
            "link_id": link.id,
            "account": account.name,
            "batch": batch,
            "new": new,
            "skipped_currency": skipped,
        })
    return results
