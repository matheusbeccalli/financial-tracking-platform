from sqlalchemy import func, select

from app.models import Account, Category, Setting

DEFAULT_LLM_MODEL = "claude-haiku-4-5-20251001"

ACCOUNTS = [
    ("Bradesco Conta", "bradesco", "corrente"),
    ("Bradesco Cartão", "bradesco", "cartao"),
    ("Inter Conta", "inter", "corrente"),
    ("Inter Cartão", "inter", "cartao"),
]

SAIDA = [
    "Mercado", "Restaurantes/Delivery", "Transporte", "Moradia",
    "Contas & Utilidades", "Saúde", "Lazer", "Assinaturas", "Vestuário",
    "Educação", "Viagem", "Presentes", "Impostos & Taxas", "Investimentos",
    "Outros",
]
ENTRADA = ["Salário", "Rendimentos", "Outras Entradas"]


def seed(session):
    if session.scalar(select(func.count()).select_from(Account)) == 0:
        session.add_all(Account(name=n, institution=i, kind=k) for n, i, k in ACCOUNTS)
    if session.scalar(select(func.count()).select_from(Category)) == 0:
        session.add_all(Category(name=n, kind="saida") for n in SAIDA)
        session.add_all(Category(name=n, kind="entrada") for n in ENTRADA)
    if session.get(Setting, "llm_model") is None:
        session.add(Setting(key="llm_model", value=DEFAULT_LLM_MODEL))
