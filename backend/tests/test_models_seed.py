from sqlalchemy import select, func

from app.models import Account, Category, Setting
from app.seed import seed


def test_seed_accounts(session):
    accounts = session.scalars(select(Account)).all()
    assert len(accounts) == 4
    assert {a.institution for a in accounts} == {"bradesco", "inter"}
    assert {a.kind for a in accounts} == {"corrente", "cartao"}


def test_seed_categories(session):
    saida = session.scalar(
        select(func.count()).select_from(Category).where(Category.kind == "saida")
    )
    entrada = session.scalar(
        select(func.count()).select_from(Category).where(Category.kind == "entrada")
    )
    assert saida == 15  # inclui Investimentos e Outros
    assert entrada == 3
    names = {c.name for c in session.scalars(select(Category))}
    assert {"Investimentos", "Salário", "Mercado"} <= names


def test_seed_idempotent_and_default_model(session):
    seed(session)  # segunda chamada não duplica
    assert session.scalar(select(func.count()).select_from(Account)) == 4
    model = session.scalar(select(Setting).where(Setting.key == "llm_model"))
    assert model is not None and model.value.startswith("claude-")
