from typing import Optional

from pydantic import BaseModel, Field


class CategoryIn(BaseModel):
    name: str
    kind: str  # "entrada" | "saida"
    color: str = "#8888aa"


class CategoryPatch(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    archived: Optional[bool] = None


class SettingsPut(BaseModel):
    llm_model: str


class TxPatch(BaseModel):
    category_id: Optional[int] = None
    ignored: Optional[bool] = None


class BudgetPut(BaseModel):
    category_id: int
    amount_cents: int = Field(ge=0)
    valid_from: str  # "YYYY-MM"


class BudgetCopy(BaseModel):
    from_month: str  # "YYYY-MM"
    to_month: str


class AccountIn(BaseModel):
    name: str
    institution: str
    kind: str  # "corrente" | "cartao"


class AccountPatch(BaseModel):
    name: Optional[str] = None


class RulePatch(BaseModel):
    category_id: int
