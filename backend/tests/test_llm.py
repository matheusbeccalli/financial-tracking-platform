from datetime import date

from app.models import Transaction
from app.services.classifier import classify_new
from app.services.llm import build_prompt, parse_response


class FakeLLM:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def classify(self, items, categories, examples=None):
        self.calls.append((items, categories, examples))
        return self.result


def make_tx(session, norm, cents=-1000):
    tx = Transaction(
        account_id=1, date=date(2026, 8, 1), description=norm, normalized=norm,
        amount_cents=cents, dedupe_hash=f"h-{norm}",
    )
    session.add(tx)
    session.flush()
    return tx


def test_llm_result_applied_with_source_llm(session):
    tx = make_tx(session, "IFOOD RESTAURANTE")
    llm = FakeLLM({})
    llm.result = {tx.id: "Restaurantes/Delivery"}
    counts = classify_new(session, [tx], llm)
    assert tx.source == "llm" and counts["llm"] == 1


def test_unknown_category_from_llm_stays_pending(session):
    tx = make_tx(session, "COISA ESTRANHA")
    counts = classify_new(session, [tx], FakeLLM({tx.id: "CategoriaInventada"}))
    assert tx.category_id is None and counts["pendente"] == 1


def test_build_prompt_contains_categories_and_items():
    prompt = build_prompt(
        [{"id": 7, "descricao": "UBER TRIP", "valor_centavos": -2350}],
        ["Transporte", "Lazer"],
    )
    assert "Transporte" in prompt and "UBER TRIP" in prompt and '"id": 7' in prompt


def test_parse_response_extracts_json_and_ignores_garbage():
    text = 'Claro! Segue:\n[{"id": 1, "categoria": "Mercado"}, {"foo": 2}]'
    assert parse_response(text) == {1: "Mercado"}


def test_parse_response_invalid_returns_empty():
    assert parse_response("não sei") == {}


def test_classify_passes_prior_rule_examples_to_llm(session):
    from sqlalchemy import select

    from app.models import Category, Rule

    transporte = session.scalar(select(Category).where(Category.name == "Transporte"))
    session.add(Rule(matcher="UBER TRIP", category_id=transporte.id))
    session.flush()
    tx = make_tx(session, "NOVA COISA")
    llm = FakeLLM({})
    classify_new(session, [tx], llm)
    _, _, examples = llm.calls[0]
    assert {"descricao": "UBER TRIP", "categoria": "Transporte"} in examples
