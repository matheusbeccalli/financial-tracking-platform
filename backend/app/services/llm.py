import json
import re

import anthropic

from app.config import settings
from app.models import Setting
from app.seed import DEFAULT_LLM_MODEL

MAX_TOKENS = 2000


def build_prompt(items: list[dict], categories: list[str]) -> str:
    return (
        "Você classifica transações financeiras pessoais brasileiras "
        "(extratos de banco e cartão de crédito).\n"
        f"Categorias válidas: {json.dumps(categories, ensure_ascii=False)}\n"
        "Valores em centavos; negativos são saídas, positivos entradas.\n"
        "Responda SOMENTE com um array JSON no formato "
        '[{"id": <id>, "categoria": "<nome exato da lista>"}] — sem texto extra.\n'
        f"Transações: {json.dumps(items, ensure_ascii=False, indent=1)}"
    )


def parse_response(text: str) -> dict[int, str]:
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if not m:
        return {}
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}
    out: dict[int, str] = {}
    for entry in data:
        if isinstance(entry, dict) and "id" in entry and "categoria" in entry:
            try:
                out[int(entry["id"])] = str(entry["categoria"])
            except (TypeError, ValueError):
                continue
    return out


class AnthropicLLM:
    def __init__(self, api_key: str, model: str):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def classify(self, items: list[dict], categories: list[str]) -> dict[int, str]:
        try:
            msg = self.client.messages.create(
                model=self.model,
                max_tokens=MAX_TOKENS,
                messages=[{"role": "user", "content": build_prompt(items, categories)}],
            )
            return parse_response(msg.content[0].text)
        except Exception:
            return {}  # LLM é acessório: falha nunca bloqueia importação


def get_llm(session) -> AnthropicLLM | None:
    if not settings.anthropic_api_key:
        return None
    setting = session.get(Setting, "llm_model")
    model = setting.value if setting else DEFAULT_LLM_MODEL
    return AnthropicLLM(settings.anthropic_api_key, model)
