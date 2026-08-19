from fastapi import APIRouter, Depends

from app.db import get_session
from app.routers.validators import require_month
from app.services.installments import installments_projection

router = APIRouter(prefix="/api/installments")


@router.get("/projection")
def projection(month: str, session=Depends(get_session)):
    require_month(month, "month")
    return installments_projection(session, month)
