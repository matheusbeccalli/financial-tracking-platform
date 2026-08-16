from typing import Optional

from pydantic import BaseModel


class CategoryIn(BaseModel):
    name: str
    kind: str  # "entrada" | "saida" | "investimento"
    color: str = "#8888aa"


class CategoryPatch(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    archived: Optional[bool] = None
    kind: Optional[str] = None  # "entrada" | "saida" | "investimento"


class SettingsPut(BaseModel):
    llm_model: str


class TxPatch(BaseModel):
    category_id: Optional[int] = None
    ignored: Optional[bool] = None


class BudgetPut(BaseModel):
    category_id: int
    amount_cents: int  # negativo = resgate planejado (kind investimento)
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
