from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.config import settings as config_settings
from app.db import get_session
from app.models import Account, Category, IgnoreRule, Rule, Setting
from app.models import CATEGORY_KINDS
from app.normalize import name_sort_key
from app.schemas import AccountIn, AccountPatch, CategoryIn, CategoryPatch, RulePatch, SettingsPut
from app.seed import DEFAULT_LLM_MODEL

router = APIRouter(prefix="/api")


def _acc_out(a: Account) -> dict:
    return {"id": a.id, "name": a.name, "institution": a.institution, "kind": a.kind}


@router.get("/accounts")
def list_accounts(session=Depends(get_session)):
    return [_acc_out(a) for a in session.scalars(select(Account))]


@router.post("/accounts", status_code=201)
def create_account(payload: AccountIn, session=Depends(get_session)):
    if payload.kind not in ("corrente", "cartao"):
        raise HTTPException(400, "kind deve ser 'corrente' ou 'cartao'")
    acc = Account(name=payload.name, institution=payload.institution, kind=payload.kind)
    session.add(acc)
    session.commit()
    return _acc_out(acc)


@router.patch("/accounts/{account_id}")
def patch_account(account_id: int, payload: AccountPatch, session=Depends(get_session)):
    acc = session.get(Account, account_id)
    if not acc:
        raise HTTPException(404, "Conta não encontrada")
    if payload.name is not None:
        acc.name = payload.name
    session.commit()
    return _acc_out(acc)


def _cat_out(c: Category) -> dict:
    return {
        "id": c.id, "name": c.name, "kind": c.kind,
        "color": c.color, "archived": c.archived,
    }


@router.get("/categories")
def list_categories(session=Depends(get_session)):
    cats = sorted(session.scalars(select(Category)), key=lambda c: name_sort_key(c.name))
    return [_cat_out(c) for c in cats]


@router.post("/categories", status_code=201)
def create_category(payload: CategoryIn, session=Depends(get_session)):
    if payload.kind not in CATEGORY_KINDS:
        raise HTTPException(400, "kind deve ser 'entrada', 'saida' ou 'investimento'")
    if session.scalar(select(Category).where(Category.name == payload.name)):
        raise HTTPException(400, f"Categoria '{payload.name}' já existe")
    cat = Category(name=payload.name, kind=payload.kind, color=payload.color)
    session.add(cat)
    session.commit()
    return _cat_out(cat)


@router.patch("/categories/{cat_id}")
def patch_category(cat_id: int, payload: CategoryPatch, session=Depends(get_session)):
    cat = session.get(Category, cat_id)
    if not cat:
        raise HTTPException(404, "Categoria não encontrada")
    if payload.kind is not None and payload.kind not in CATEGORY_KINDS:
        raise HTTPException(400, "kind deve ser 'entrada', 'saida' ou 'investimento'")
    for field in ("name", "color", "archived", "kind"):
        value = getattr(payload, field)
        if value is not None:
            setattr(cat, field, value)
    session.commit()
    return _cat_out(cat)


@router.get("/settings")
def get_settings(session=Depends(get_session)):
    setting = session.get(Setting, "llm_model")
    return {
        "llm_model": setting.value if setting else DEFAULT_LLM_MODEL,
        "api_key_set": bool(config_settings.anthropic_api_key),
    }


@router.put("/settings")
def put_settings(payload: SettingsPut, session=Depends(get_session)):
    setting = session.get(Setting, "llm_model")
    if setting:
        setting.value = payload.llm_model
    else:
        session.add(Setting(key="llm_model", value=payload.llm_model))
    session.commit()
    return {"llm_model": payload.llm_model}


@router.get("/rules")
def list_rules(session=Depends(get_session)):
    return [
        {"id": r.id, "matcher": r.matcher, "category_id": r.category_id}
        for r in session.scalars(select(Rule))
    ]


@router.patch("/rules/{rule_id}")
def patch_rule(rule_id: int, payload: RulePatch, session=Depends(get_session)):
    rule = session.get(Rule, rule_id)
    if not rule:
        raise HTTPException(404, "Regra não encontrada")
    if not session.get(Category, payload.category_id):
        raise HTTPException(404, "Categoria não encontrada")
    rule.category_id = payload.category_id
    session.commit()
    return {"id": rule.id, "matcher": rule.matcher, "category_id": rule.category_id}


@router.get("/ignore-rules")
def list_ignore_rules(session=Depends(get_session)):
    return [
        {"id": r.id, "matcher": r.matcher}
        for r in session.scalars(select(IgnoreRule))
    ]


@router.delete("/ignore-rules/{rule_id}", status_code=204)
def delete_ignore_rule(rule_id: int, session=Depends(get_session)):
    rule = session.get(IgnoreRule, rule_id)
    if not rule:
        raise HTTPException(404, "Regra de ignorar não encontrada")
    session.delete(rule)
    session.commit()


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, session=Depends(get_session)):
    rule = session.get(Rule, rule_id)
    if not rule:
        raise HTTPException(404, "Regra não encontrada")
    session.delete(rule)
    session.commit()
