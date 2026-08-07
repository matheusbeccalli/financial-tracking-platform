from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.db import get_session
from app.models import Budget, Category
from app.routers.validators import require_month
from app.schemas import BudgetCopy, BudgetPut
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


@router.post("/copy")
def copy_budget(payload: BudgetCopy, session=Depends(get_session)):
    require_month(payload.from_month, "from_month")
    require_month(payload.to_month, "to_month")
    if payload.from_month == payload.to_month:
        raise HTTPException(400, "Meses de origem e destino são iguais")
    bmap = budget_map(session, payload.from_month)
    copied = 0
    for cat in session.scalars(select(Category).where(~Category.archived)):
        cents = bmap.get(cat.id, 0)
        existing = session.scalar(
            select(Budget).where(
                Budget.category_id == cat.id,
                Budget.valid_from == payload.to_month,
            )
        )
        if existing:
            existing.amount_cents = cents
        else:
            session.add(
                Budget(
                    category_id=cat.id,
                    amount_cents=cents,
                    valid_from=payload.to_month,
                )
            )
        copied += 1
    session.commit()
    return {"copied": copied}
