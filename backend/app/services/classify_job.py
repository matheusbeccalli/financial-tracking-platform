import logging

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Transaction
from app.services.classifier import LLM_BATCH_SIZE, classify_chunk, llm_context
from app.services.llm import get_llm

# batch_id -> "running" | "done" | "error". Em memória de propósito: app
# single-user local; contagens vêm sempre do banco (job_status).
JOBS: dict[int, str] = {}

MAX_JOBS = 20


def prune_jobs() -> None:
    """Poda os jobs terminados mais antigos; o dict viveria para sempre sem isso."""
    finished = [k for k, v in JOBS.items() if v != "running"]
    for k in finished[: max(0, len(JOBS) - MAX_JOBS)]:
        del JOBS[k]


def run_classification(batch_id: int) -> None:
    session = SessionLocal()
    try:
        llm = get_llm(session)
        pending = list(
            session.scalars(
                select(Transaction).where(
                    Transaction.batch_id == batch_id,
                    Transaction.category_id.is_(None),
                    Transaction.ignored.is_(False),
                )
            )
        )
        if llm is not None:
            by_name, examples = llm_context(session)
            for i in range(0, len(pending), LLM_BATCH_SIZE):
                chunk = pending[i : i + LLM_BATCH_SIZE]
                classify_chunk(session, chunk, llm, by_name, examples)
                session.commit()  # progresso real e à prova de queda
        JOBS[batch_id] = "done"
    except Exception:
        logging.getLogger(__name__).exception(
            "Classificação em background falhou (batch %s)", batch_id
        )
        session.rollback()
        JOBS[batch_id] = "error"
    finally:
        prune_jobs()
        session.close()


def job_status(session, batch_id: int) -> dict:
    rows = session.execute(
        select(Transaction.source, Transaction.category_id, Transaction.ignored).where(
            Transaction.batch_id == batch_id
        )
    ).all()
    active = [r for r in rows if not r.ignored]
    counts = {
        "regra": sum(1 for r in active if r.category_id and r.source == "regra"),
        "llm": sum(1 for r in active if r.category_id and r.source == "llm"),
        "pendente": sum(1 for r in active if r.category_id is None),
    }
    status = JOBS.get(batch_id)
    if status is None:
        status = "interrupted" if counts["pendente"] else "done"
    return {
        "status": status,
        "total": len(active),
        "done": counts["regra"] + counts["llm"],
        "counts": counts,
    }
