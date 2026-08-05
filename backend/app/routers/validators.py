import re

from fastapi import HTTPException

MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def require_month(value: str, field: str = "month") -> str:
    if not MONTH_RE.match(value):
        raise HTTPException(400, f"{field} deve ser YYYY-MM (mês 01-12)")
    return value
