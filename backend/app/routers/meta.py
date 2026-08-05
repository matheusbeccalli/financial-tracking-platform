from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.db import get_session
from app.models import Account, Category, Rule, Setting
from app.schemas import CategoryIn, CategoryPatch, SettingsPut
from app.seed import DEFAULT_LLM_MODEL

router = APIRouter(prefix="/api")


@router.get("/accounts")
def list_accounts(session=Depends(get_session)):
    return [
        {"id": a.id, "name": a.name, "institution": a.institution, "kind": a.kind}
        for a in session.scalars(select(Account))
    ]


def _cat_out(c: Category) -> dict:
    return {
        "id": c.id, "name": c.name, "kind": c.kind,
        "color": c.color, "archived": c.archived,
    }


@router.get("/categories")
def list_categories(session=Depends(get_session)):
    return [_cat_out(c) for c in session.scalars(select(Category))]


@router.post("/categories", status_code=201)
def create_category(payload: CategoryIn, session=Depends(get_session)):
    if payload.kind not in ("entrada", "saida"):
        raise HTTPException(400, "kind deve ser 'entrada' ou 'saida'")
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
    for field in ("name", "color", "archived"):
        value = getattr(payload, field)
        if value is not None:
            setattr(cat, field, value)
    session.commit()
    return _cat_out(cat)


@router.get("/settings")
def get_settings(session=Depends(get_session)):
    setting = session.get(Setting, "llm_model")
    return {"llm_model": setting.value if setting else DEFAULT_LLM_MODEL}


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


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, session=Depends(get_session)):
    rule = session.get(Rule, rule_id)
    if not rule:
        raise HTTPException(404, "Regra não encontrada")
    session.delete(rule)
    session.commit()
