import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.db import get_session
from app.models import Transaction
from app.routers.transactions import tx_out
from app.services.bridge import bridge as compute_bridge
from app.services.budget import month_summary

router = APIRouter(prefix="/api/dashboard")

MONTH_RE = re.compile(r"^\d{4}-\d{2}$")
FEED_LIMIT = 20


@router.get("/summary")
def summary(month: str, session=Depends(get_session)):
    if not MONTH_RE.match(month):
        raise HTTPException(400, "month deve ser YYYY-MM")
    return month_summary(session, month)


@router.get("/feed")
def llm_feed(session=Depends(get_session)):
    txs = session.scalars(
        select(Transaction)
        .where(Transaction.source == "llm")
        .order_by(Transaction.id.desc())
        .limit(FEED_LIMIT)
    )
    return [tx_out(t) for t in txs]


@router.get("/bridge")
def bridge(period: str, ref: str, session=Depends(get_session)):
    if not MONTH_RE.match(ref):
        raise HTTPException(400, "ref deve ser YYYY-MM")
    try:
        return compute_bridge(session, period, ref)
    except ValueError as e:
        raise HTTPException(400, str(e))
