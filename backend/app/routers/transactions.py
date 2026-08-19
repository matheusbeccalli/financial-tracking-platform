from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.db import get_session
from app.models import ImportBatch, Transaction
from app.routers.validators import require_month
from app.schemas import TxPatch
from app.services.budget import month_bounds
from app.services.classifier import apply_correction, apply_ignore

router = APIRouter(prefix="/api/transactions")


def resolve_twins(session, txs: list[Transaction]) -> dict[int, dict]:
    """Resumo das gêmeas apontadas por `txs`, em uma consulta só (sem N+1)."""
    ids = {t.duplicate_of_id for t in txs if t.duplicate_of_id is not None}
    if not ids:
        return {}
    rows = session.execute(
        select(
            Transaction.id,
            Transaction.date,
            Transaction.description,
            ImportBatch.source,
        )
        .join(ImportBatch, ImportBatch.id == Transaction.batch_id, isouter=True)
        .where(Transaction.id.in_(ids))
    )
    return {
        r.id: {
            "id": r.id,
            "date": r.date.isoformat(),
            "description": r.description,
            "origin": r.source,
        }
        for r in rows
    }


def tx_out(t: Transaction, twins: dict[int, dict]) -> dict:
    return {
        "id": t.id, "account_id": t.account_id, "date": t.date.isoformat(),
        "description": t.description, "amount_cents": t.amount_cents,
        "category_id": t.category_id, "source": t.source,
        "installment": t.installment, "ignored": t.ignored,
        "duplicate_of_id": t.duplicate_of_id,
        "duplicate_of": twins.get(t.duplicate_of_id) if t.duplicate_of_id else None,
    }


@router.get("")
def list_transactions(
    month: Optional[str] = None,
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    q: Optional[str] = None,
    include_ignored: bool = True,
    session=Depends(get_session),
):
    stmt = select(Transaction).order_by(Transaction.date.desc(), Transaction.id.desc())
    if month:
        require_month(month, "month")
        start, end = month_bounds(month)
        stmt = stmt.where(Transaction.date >= start, Transaction.date <= end)
    if account_id:
        stmt = stmt.where(Transaction.account_id == account_id)
    if category_id:
        stmt = stmt.where(Transaction.category_id == category_id)
    if q:
        stmt = stmt.where(Transaction.description.icontains(q, autoescape=True))
    if not include_ignored:
        stmt = stmt.where(Transaction.ignored.is_(False))
    txs = list(session.scalars(stmt))
    twins = resolve_twins(session, txs)
    return [tx_out(t, twins) for t in txs]


@router.patch("/{tx_id}")
def patch_transaction(tx_id: int, payload: TxPatch, session=Depends(get_session)):
    tx = session.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transação não encontrada")
    if payload.category_id is not None:
        apply_correction(session, tx, payload.category_id)
    if payload.ignored is not None:
        apply_ignore(session, tx, payload.ignored)
    session.commit()
    return tx_out(tx, resolve_twins(session, [tx]))
