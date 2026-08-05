from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.db import get_session
from app.models import Budget, Category
from app.routers.validators import require_month
from app.schemas import BudgetPut
from app.services.budget import budget_map

router = APIRouter(prefix="/api/budgets")


@router.get("")
def budgets_for_month(month: str, session=Depends(get_session)):
    require_month(month, "month")
    bmap = budget_map(session, month)
    cats = {c.id: c for c in session.scalars(select(Category))}
    return [
        {
            "category_id": cid,
            "category_name": cats[cid].name,
            "kind": cats[cid].kind,
            "amount_cents": cents,
        }
        for cid, cents in bmap.items()
    ]


@router.put("")
def put_budget(payload: BudgetPut, session=Depends(get_session)):
    require_month(payload.valid_from, "valid_from")
    if not session.get(Category, payload.category_id):
        raise HTTPException(404, "Categoria não encontrada")
    existing = session.scalar(
        select(Budget).where(
            Budget.category_id == payload.category_id,
            Budget.valid_from == payload.valid_from,
        )
    )
    if existing:
        existing.amount_cents = payload.amount_cents
    else:
        session.add(Budget(**payload.model_dump()))
    session.commit()
    return {"ok": True}
