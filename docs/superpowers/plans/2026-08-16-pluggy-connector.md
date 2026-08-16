# Conector Open Finance via Pluggy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar transações do banco via API da Pluggy (caminho gratuito Meu Pluggy) desaguando em `import_parsed()` — dedupe, regras de ignorar e classificação LLM vêm de graça.

**Architecture:** Cliente fino da API Pluggy atrás de interface (`services/pluggy.py`, testes com respostas gravadas via `httpx.MockTransport`); orquestração em `services/pluggy_sync.py` que converte transações Pluggy em `ParsedTransaction` e chama `import_parsed()` por vínculo; tabela nova `pluggy_link` (conta Pluggy → `Account` local + data de corte + última sync); router `/api/pluggy/*`; frontend com card de vínculos em Configurações e card Sincronizar em Importar reusando `ResultCard`/polling/Desfazer existentes.

**Tech Stack:** FastAPI + SQLAlchemy + SQLite; httpx (já em requirements); React/Vite/TS + TanStack Query; Vitest/pytest.

**Spec:** `docs/superpowers/specs/2026-08-16-pluggy-connector-design.md`

**Regras da casa:** commits sem co-autoria de AI; trabalho direto na `main`; uma revisão de código ao final (não por task); NUNCA subir servidor na porta 8000 (uvicorn do usuário); `npm run build` ao final para o usuário ver o frontend.

**Fatos da API Pluggy usados neste plano** (verificados em docs.pluggy.ai 2026-08-16):
- `POST /auth` com `{"clientId", "clientSecret"}` → `{"apiKey"}` (validade ~2h); requests seguintes usam header `X-API-KEY`.
- `GET /items/{id}` → `{id, status, connector: {name}, ...}`; status problemáticos: `LOGIN_ERROR`, `WAITING_USER_INPUT`, `OUTDATED`.
- `GET /accounts?itemId=` → `{results: [{id, type: "BANK"|"CREDIT", subtype, name, number, ...}], page, totalPages}`.
- `GET /transactions?accountId=&from=YYYY-MM-DD&to=&page=&pageSize=500` → `{results, page, totalPages}`. Transação: `{id, description, descriptionRaw, amount, date (ISO8601 UTC), type: "CREDIT"|"DEBIT", status: "PENDING"|"POSTED", currencyCode, creditCardMetadata?}`.
- **Sinal do `amount`**: conta BANK → positivo = entrada, negativo = saída (igual ao nosso); conta CREDIT → positivo = compra (dívida), negativo = pagamento/estorno → **inverter o sinal**. Validar com dados reais na verificação final (ponto de atenção da spec).

---

### Task 1: Config + modelo `PluggyLink`

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/models.py`
- Test: `backend/tests/test_pluggy_sync.py` (novo)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_pluggy_sync.py
from datetime import date, datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import PluggyLink


def test_pluggy_link_roundtrip(session):
    link = PluggyLink(
        item_id="item-1",
        pluggy_account_id="acc-1",
        pluggy_type="BANK",
        account_id=1,
        sync_from=date(2026, 8, 1),
    )
    session.add(link)
    session.commit()
    got = session.get(PluggyLink, link.id)
    assert got.sync_from == date(2026, 8, 1)
    assert got.last_synced_at is None


def test_pluggy_account_id_unico(session):
    session.add(
        PluggyLink(item_id="i", pluggy_account_id="dup", pluggy_type="BANK",
                   account_id=1, sync_from=date(2026, 8, 1))
    )
    session.commit()
    session.add(
        PluggyLink(item_id="i", pluggy_account_id="dup", pluggy_type="CREDIT",
                   account_id=2, sync_from=date(2026, 8, 1))
    )
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_pluggy_sync.py -v`
Expected: FAIL com `ImportError: cannot import name 'PluggyLink'`

- [ ] **Step 3: Write minimal implementation**

Em `backend/app/models.py`, depois da classe `Budget` (antes de `Setting`):

```python
class PluggyLink(Base):
    """Conta da Pluggy vinculada a uma Account local (spec 2026-08-16)."""

    __tablename__ = "pluggy_link"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[str]  # conexão bancária na Pluggy (um item = N contas)
    pluggy_account_id: Mapped[str] = mapped_column(unique=True)
    pluggy_type: Mapped[str]  # "BANK" | "CREDIT" — decide o sinal do amount
    account_id: Mapped[int] = mapped_column(ForeignKey("account.id"))
    sync_from: Mapped[date] = mapped_column(Date)  # nunca gravar nada antes disto
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
```

(`date`, `datetime`, `Date`, `DateTime`, `ForeignKey`, `Optional` já estão importados em models.py.)

Em `backend/app/config.py`:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    pluggy_client_id: str = ""
    pluggy_client_secret: str = ""
    db_path: str = "financas.db"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
```

Sem migração: `init_db()` roda `Base.metadata.create_all` no startup e cria a tabela nova no banco real.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_pluggy_sync.py -v`
Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/config.py backend/tests/test_pluggy_sync.py
git commit -m "feat(pluggy): modelo PluggyLink e credenciais no config"
```

---

### Task 2: Cliente da API — `services/pluggy.py`

**Files:**
- Create: `backend/app/services/pluggy.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_pluggy_client.py` (novo)

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_pluggy_client.py
"""Cliente Pluggy contra um MockTransport — nenhum teste toca a API real."""
from datetime import date

import httpx
import pytest

from app.services.pluggy import PluggyClient, PluggyError


def make_client(handler):
    return PluggyClient("cid", "csecret", transport=httpx.MockTransport(handler))


def test_autentica_uma_vez_e_usa_x_api_key():
    calls = []

    def handler(request):
        calls.append((request.method, request.url.path, request.headers.get("X-API-KEY")))
        if request.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": "k1"})
        return httpx.Response(200, json={"id": "item-1", "status": "UPDATED"})

    c = make_client(handler)
    c.get_item("item-1")
    c.get_item("item-1")
    auths = [x for x in calls if x[1] == "/auth"]
    gets = [x for x in calls if x[1] == "/items/item-1"]
    assert len(auths) == 1  # apiKey cacheada
    assert all(g[2] == "k1" for g in gets)


def test_renova_apikey_em_401():
    keys = iter(["k1", "k2"])
    state = {"gets": 0}

    def handler(request):
        if request.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": next(keys)})
        state["gets"] += 1
        if request.headers.get("X-API-KEY") == "k1":
            return httpx.Response(401, json={})
        return httpx.Response(200, json={"id": "item-1", "status": "UPDATED"})

    c = make_client(handler)
    assert c.get_item("item-1")["status"] == "UPDATED"
    assert state["gets"] == 2  # tentou com k1, renovou, repetiu com k2


def test_credencial_invalida_vira_pluggy_error():
    def handler(request):
        return httpx.Response(401, json={"message": "invalid"})

    c = make_client(handler)
    with pytest.raises(PluggyError) as e:
        c.get_item("x")
    assert "credencial" in str(e.value).lower()


def test_item_404_vira_pluggy_error_com_status():
    def handler(request):
        if request.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": "k"})
        return httpx.Response(404, json={})

    c = make_client(handler)
    with pytest.raises(PluggyError) as e:
        c.get_item("nao-existe")
    assert e.value.status == 404


def test_transactions_pagina_ate_o_fim():
    def handler(request):
        if request.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": "k"})
        page = int(request.url.params["page"])
        assert request.url.params["accountId"] == "acc-1"
        assert request.url.params["from"] == "2026-08-01"
        return httpx.Response(200, json={
            "results": [{"id": f"t{page}"}],
            "page": page,
            "totalPages": 3,
        })

    c = make_client(handler)
    txs = c.get_transactions("acc-1", date(2026, 8, 1), date(2026, 8, 16))
    assert [t["id"] for t in txs] == ["t1", "t2", "t3"]


def test_get_accounts_devolve_results():
    def handler(request):
        if request.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": "k"})
        assert request.url.params["itemId"] == "item-1"
        return httpx.Response(200, json={"results": [{"id": "acc-1", "type": "BANK"}]})

    c = make_client(handler)
    assert c.get_accounts("item-1") == [{"id": "acc-1", "type": "BANK"}]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_pluggy_client.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.services.pluggy'`

- [ ] **Step 3: Write the implementation**

```python
# backend/app/services/pluggy.py
"""Cliente fino da API Pluggy (docs.pluggy.ai). Atrás de interface de propósito:
testes usam MockTransport/fakes — nenhum teste bate na API real."""
from datetime import date

import httpx

from app.config import settings

BASE_URL = "https://api.pluggy.ai"
PAGE_SIZE = 500


class PluggyError(Exception):
    """Erro da API Pluggy, mensagem já em pt-BR para a UI."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class PluggyClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        transport: httpx.BaseTransport | None = None,
    ):
        self._auth = {"clientId": client_id, "clientSecret": client_secret}
        self._http = httpx.Client(base_url=BASE_URL, timeout=30.0, transport=transport)
        self._api_key: str | None = None

    def _authenticate(self) -> str:
        r = self._http.post("/auth", json=self._auth)
        if r.status_code in (401, 403):
            raise PluggyError(
                "Credencial Pluggy inválida — confira PLUGGY_CLIENT_ID e "
                "PLUGGY_CLIENT_SECRET em backend/.env",
                r.status_code,
            )
        if r.status_code != 200:
            raise PluggyError(f"Pluggy /auth respondeu {r.status_code}", r.status_code)
        self._api_key = r.json()["apiKey"]
        return self._api_key

    def _get(self, path: str, params: dict | None = None) -> dict:
        key = self._api_key or self._authenticate()
        r = self._http.get(path, params=params, headers={"X-API-KEY": key})
        if r.status_code in (401, 403):  # apiKey expira em ~2h — renova uma vez
            key = self._authenticate()
            r = self._http.get(path, params=params, headers={"X-API-KEY": key})
        if r.status_code == 404:
            raise PluggyError(
                "Item não encontrado na Pluggy — confira o Item ID no dashboard", 404
            )
        if r.status_code != 200:
            raise PluggyError(f"Pluggy respondeu {r.status_code} em {path}", r.status_code)
        return r.json()

    def get_item(self, item_id: str) -> dict:
        return self._get(f"/items/{item_id}")

    def get_accounts(self, item_id: str) -> list[dict]:
        return self._get("/accounts", {"itemId": item_id})["results"]

    def get_transactions(self, account_id: str, date_from: date, date_to: date) -> list[dict]:
        out: list[dict] = []
        page = 1
        while True:
            data = self._get(
                "/transactions",
                {
                    "accountId": account_id,
                    "from": date_from.isoformat(),
                    "to": date_to.isoformat(),
                    "pageSize": PAGE_SIZE,
                    "page": page,
                },
            )
            out.extend(data["results"])
            if page >= data.get("totalPages", 1):
                return out
            page += 1


# Singleton: preserva o cache da apiKey entre requests do FastAPI.
_client: PluggyClient | None = None


def get_pluggy() -> PluggyClient | None:
    """None = credencial ausente no .env (a UI mostra o estado antes de sincronizar)."""
    global _client
    if not (settings.pluggy_client_id and settings.pluggy_client_secret):
        return None
    if _client is None:
        _client = PluggyClient(settings.pluggy_client_id, settings.pluggy_client_secret)
    return _client
```

Em `backend/tests/conftest.py`, adicionar ao lado do fixture `no_real_api_key`:

```python
@pytest.fixture(autouse=True)
def no_real_pluggy(monkeypatch):
    """Testes nunca chamam a API real da Pluggy, mesmo com credencial no .env."""
    from app.config import settings as app_settings
    from app.services import pluggy

    monkeypatch.setattr(app_settings, "pluggy_client_id", "")
    monkeypatch.setattr(app_settings, "pluggy_client_secret", "")
    monkeypatch.setattr(pluggy, "_client", None)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_pluggy_client.py -v`
Expected: 6 PASS

- [ ] **Step 5: Run the full backend suite (o conftest mudou)**

Run: `cd backend && python -m pytest -q`
Expected: tudo verde (122 + 8 novos)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/pluggy.py backend/tests/test_pluggy_client.py backend/tests/conftest.py
git commit -m "feat(pluggy): cliente da API com cache de apiKey e paginacao"
```

---

### Task 3: Transformação — `to_parsed` em `services/pluggy_sync.py`

**Files:**
- Create: `backend/app/services/pluggy_sync.py`
- Test: `backend/tests/test_pluggy_sync.py` (acrescentar)

- [ ] **Step 1: Write the failing tests** (acrescentar em `backend/tests/test_pluggy_sync.py`)

```python
from app.services.pluggy_sync import to_parsed


def _raw(**kw):
    base = {
        "id": "t1",
        "description": "UBER TRIP",
        "descriptionRaw": None,
        "amount": -19.9,
        "date": "2026-08-10T03:00:00.000Z",
        "type": "DEBIT",
        "status": "POSTED",
        "currencyCode": "BRL",
    }
    base.update(kw)
    return base


def test_bank_mantem_sinal_e_converte_centavos():
    parsed, skipped = to_parsed([_raw(amount=-19.9), _raw(id="t2", amount=1234.56)], "BANK")
    assert [p.amount_cents for p in parsed] == [-1990, 123456]
    assert parsed[0].date == date(2026, 8, 10)
    assert skipped == 0


def test_credit_inverte_sinal():
    # Cartão na Pluggy: positivo = compra, negativo = pagamento/estorno.
    parsed, _ = to_parsed(
        [_raw(amount=50.0), _raw(id="t2", amount=-200.0)], "CREDIT"
    )
    assert [p.amount_cents for p in parsed] == [-5000, 20000]


def test_prefere_description_raw():
    parsed, _ = to_parsed([_raw(descriptionRaw="UBER *TRIP 123")], "BANK")
    assert parsed[0].description == "UBER *TRIP 123"


def test_pending_fica_de_fora():
    # PENDING pode mudar de valor/descrição ao postar; entra no próximo sync.
    parsed, skipped = to_parsed([_raw(status="PENDING")], "BANK")
    assert parsed == []
    assert skipped == 0  # pending não conta como "pulada de moeda"


def test_moeda_estrangeira_pulada_e_contada():
    parsed, skipped = to_parsed([_raw(currencyCode="USD"), _raw(id="t2")], "BANK")
    assert len(parsed) == 1
    assert skipped == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_pluggy_sync.py -v`
Expected: novos FAIL com `ModuleNotFoundError: No module named 'app.services.pluggy_sync'`

- [ ] **Step 3: Write the implementation**

```python
# backend/app/services/pluggy_sync.py
"""Sync Pluggy → import_parsed(). A Pluggy só muda a origem: dedupe, regras
de ignorar e classificação LLM são os mesmos do import por arquivo."""
from datetime import date

from app.parsers import ParsedTransaction


def to_parsed(raw: list[dict], pluggy_type: str) -> tuple[list[ParsedTransaction], int]:
    """Converte transações da Pluggy. Retorna (parsed, puladas_por_moeda).

    - PENDING fica de fora (pode mudar ao postar; o overlap do próximo sync pega).
    - Moeda ≠ BRL é pulada e contada (spec: reportar).
    - Sinal: BANK já vem como o nosso (negativo = saída); CREDIT vem invertido
      (positivo = compra) → inverte. Validar com dados reais (ponto de atenção).
    """
    parsed: list[ParsedTransaction] = []
    skipped_currency = 0
    for t in raw:
        if t.get("status") == "PENDING":
            continue
        if t.get("currencyCode", "BRL") != "BRL":
            skipped_currency += 1
            continue
        cents = round(t["amount"] * 100)
        if pluggy_type == "CREDIT":
            cents = -cents
        parsed.append(
            ParsedTransaction(
                date=date.fromisoformat(t["date"][:10]),
                description=t.get("descriptionRaw") or t["description"],
                amount_cents=cents,
            )
        )
    return parsed, skipped_currency
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_pluggy_sync.py -v`
Expected: todos PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/pluggy_sync.py backend/tests/test_pluggy_sync.py
git commit -m "feat(pluggy): to_parsed com sinal por tipo de conta e filtros"
```

---

### Task 4: Orquestração — `sync_all`

**Files:**
- Modify: `backend/app/services/pluggy_sync.py`
- Test: `backend/tests/test_pluggy_sync.py` (acrescentar)

- [ ] **Step 1: Write the failing tests** (acrescentar em `backend/tests/test_pluggy_sync.py`)

```python
from app.models import Transaction
from app.services.pluggy import PluggyError
from app.services.pluggy_sync import sync_all


class FakePluggy:
    """Grava as janelas pedidas e devolve transações fixas por conta."""

    def __init__(self, by_account: dict[str, list[dict]], fail: set[str] = frozenset()):
        self.by_account = by_account
        self.fail = fail
        self.windows: dict[str, tuple[date, date]] = {}

    def get_transactions(self, account_id, date_from, date_to):
        if account_id in self.fail:
            raise PluggyError("Pluggy respondeu 500", 500)
        self.windows[account_id] = (date_from, date_to)
        return self.by_account.get(account_id, [])


def _link(session, pluggy_id="acc-1", account_id=1, sync_from=date(2026, 8, 1),
          last=None, pluggy_type="BANK"):
    link = PluggyLink(item_id="item-1", pluggy_account_id=pluggy_id,
                      pluggy_type=pluggy_type, account_id=account_id,
                      sync_from=sync_from, last_synced_at=last)
    session.add(link)
    session.commit()
    return link


def test_sync_importa_via_import_parsed(session):
    link = _link(session)
    fake = FakePluggy({"acc-1": [_raw(), _raw(id="t2", amount=-5.0, description="PADARIA")]})
    results = sync_all(session, fake, today=date(2026, 8, 16))
    session.commit()
    assert len(results) == 1
    r = results[0]
    assert r["batch"].source == "pluggy"
    assert r["batch"].filename == "Pluggy · Bradesco Conta · 2026-08-16"
    assert r["batch"].new_count == 2
    txs = session.query(Transaction).filter_by(batch_id=r["batch"].id).all()
    assert {t.amount_cents for t in txs} == {-1990, -500}
    assert link.last_synced_at is not None


def test_primeira_sync_usa_sync_from(session):
    _link(session, sync_from=date(2026, 8, 5))
    fake = FakePluggy({"acc-1": []})
    sync_all(session, fake, today=date(2026, 8, 16))
    assert fake.windows["acc-1"] == (date(2026, 8, 5), date(2026, 8, 16))


def test_resync_parte_do_last_synced_menos_3_dias(session):
    from datetime import datetime

    _link(session, sync_from=date(2026, 8, 1), last=datetime(2026, 8, 14, 12, 0))
    fake = FakePluggy({"acc-1": []})
    sync_all(session, fake, today=date(2026, 8, 16))
    assert fake.windows["acc-1"] == (date(2026, 8, 11), date(2026, 8, 16))


def test_overlap_nao_recua_antes_do_corte(session):
    from datetime import datetime

    _link(session, sync_from=date(2026, 8, 13), last=datetime(2026, 8, 14, 12, 0))
    fake = FakePluggy({"acc-1": []})
    sync_all(session, fake, today=date(2026, 8, 16))
    assert fake.windows["acc-1"] == (date(2026, 8, 13), date(2026, 8, 16))


def test_nada_antes_do_corte_mesmo_se_api_devolver(session):
    # Cinto e suspensório: a API filtra por from, mas o invariante da spec
    # ("nunca grava antes do corte") não pode depender dela.
    _link(session, sync_from=date(2026, 8, 5))
    fake = FakePluggy({"acc-1": [_raw(date="2026-08-04T03:00:00.000Z")]})
    results = sync_all(session, fake, today=date(2026, 8, 16))
    assert results[0]["batch"].new_count == 0


def test_falha_em_um_vinculo_nao_aborta_os_outros(session):
    _link(session, pluggy_id="acc-1", account_id=1)
    _link(session, pluggy_id="acc-2", account_id=2)
    fake = FakePluggy({"acc-2": [_raw()]}, fail={"acc-1"})
    results = sync_all(session, fake, today=date(2026, 8, 16))
    assert "error" in results[0]
    assert results[1]["batch"].new_count == 1
    # o vínculo que falhou não avança o last_synced_at
    links = session.query(PluggyLink).order_by(PluggyLink.id).all()
    assert links[0].last_synced_at is None
    assert links[1].last_synced_at is not None


def test_resync_dentro_do_overlap_deduplica(session):
    _link(session)
    fake = FakePluggy({"acc-1": [_raw()]})
    r1 = sync_all(session, fake, today=date(2026, 8, 16))
    session.commit()
    r2 = sync_all(session, fake, today=date(2026, 8, 16))
    session.commit()
    assert r1[0]["batch"].new_count == 1
    assert r2[0]["batch"].new_count == 0
    assert r2[0]["batch"].dup_count == 1
```

(Nota: `seed()` do conftest cria as contas locais — a conta id 1 é "Bradesco Conta"; confirme com `backend/app/seed.py` se o nome divergir e ajuste o assert do filename.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_pluggy_sync.py -v`
Expected: novos FAIL com `ImportError: cannot import name 'sync_all'`

- [ ] **Step 3: Write the implementation** (acrescentar em `backend/app/services/pluggy_sync.py`)

```python
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.models import Account, PluggyLink
from app.parsers import ParsedTransaction
from app.services.importer import import_parsed

OVERLAP_DAYS = 3  # lançamentos publicados com atraso; dedupe segura os repetidos


def sync_all(session, client, today: date | None = None) -> list[dict]:
    """Sincroniza todos os vínculos. Falha em um não aborta os outros.

    Retorna, por vínculo: {"link_id", "account", "batch", "new", "skipped_currency"}
    ou {"link_id", "account", "error"}. Quem chama commita.
    """
    today = today or date.today()
    results: list[dict] = []
    for link in session.scalars(select(PluggyLink).order_by(PluggyLink.id)):
        account = session.get(Account, link.account_id)
        start = link.sync_from
        if link.last_synced_at is not None:
            start = max(start, link.last_synced_at.date() - timedelta(days=OVERLAP_DAYS))
        try:
            raw = client.get_transactions(link.pluggy_account_id, start, today)
        except PluggyError as e:
            results.append({"link_id": link.id, "account": account.name, "error": str(e)})
            continue
        parsed, skipped = to_parsed(raw, link.pluggy_type)
        parsed = [p for p in parsed if p.date >= link.sync_from]  # invariante da spec
        filename = f"Pluggy · {account.name} · {today.isoformat()}"
        batch, new = import_parsed(session, link.account_id, filename, "pluggy", parsed)
        # naive UTC, mesma convenção do imported_at (server_default now() do SQLite)
        link.last_synced_at = datetime.now(timezone.utc).replace(tzinfo=None)
        results.append({
            "link_id": link.id,
            "account": account.name,
            "batch": batch,
            "new": new,
            "skipped_currency": skipped,
        })
    return results
```

E no topo do arquivo, junte os imports (o `date` do Task 3 já existe):

```python
from app.services.pluggy import PluggyError
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_pluggy_sync.py -v`
Expected: todos PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/pluggy_sync.py backend/tests/test_pluggy_sync.py
git commit -m "feat(pluggy): sync_all com janela por vinculo e falha isolada"
```

---

### Task 5: Endpoints de vínculo — `routers/pluggy.py` (links + items)

**Files:**
- Create: `backend/app/routers/pluggy.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_api_pluggy.py` (novo)

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_api_pluggy.py
"""Endpoints /api/pluggy com cliente fake via dependency_overrides."""
from datetime import date

from app.models import PluggyLink, Transaction
from app.services.pluggy import PluggyError, get_pluggy


class FakePluggyApi:
    def __init__(self, status="UPDATED", accounts=None, txs=None):
        self.status = status
        self.accounts = accounts if accounts is not None else [
            {"id": "acc-1", "type": "BANK", "subtype": "CHECKING_ACCOUNT",
             "name": "Conta Corrente", "number": "0001"},
        ]
        self.txs = txs or {}

    def get_item(self, item_id):
        if item_id == "nao-existe":
            raise PluggyError("Item não encontrado na Pluggy — confira o Item ID no dashboard", 404)
        return {"id": item_id, "status": self.status, "connector": {"name": "Bradesco"}}

    def get_accounts(self, item_id):
        return self.accounts

    def get_transactions(self, account_id, date_from, date_to):
        return self.txs.get(account_id, [])


def use_fake(client, fake):
    client.app.dependency_overrides[get_pluggy] = lambda: fake
    return fake


def test_links_vazio_sem_credencial(client):
    r = client.get("/api/pluggy/links")
    assert r.status_code == 200
    body = r.json()
    assert body["credential_set"] is False
    assert body["links"] == []


def test_last_tx_dates_por_conta(client, session):
    session.add(Transaction(account_id=1, date=date(2026, 7, 30), description="X",
                            normalized="X", amount_cents=-100, dedupe_hash="h1"))
    session.commit()
    r = client.get("/api/pluggy/links")
    assert r.json()["last_tx_dates"]["1"] == "2026-07-30"


def test_item_accounts(client):
    use_fake(client, FakePluggyApi())
    r = client.get("/api/pluggy/items/item-1/accounts")
    assert r.status_code == 200
    body = r.json()
    assert body["item_status"] == "UPDATED"
    assert body["connector"] == "Bradesco"
    assert body["accounts"][0]["id"] == "acc-1"


def test_item_accounts_404(client):
    use_fake(client, FakePluggyApi())
    r = client.get("/api/pluggy/items/nao-existe/accounts")
    assert r.status_code == 404


def test_item_accounts_sem_credencial_503(client):
    r = client.get("/api/pluggy/items/item-1/accounts")
    assert r.status_code == 503
    assert ".env" in r.json()["detail"]


def test_cria_e_remove_vinculo(client):
    payload = {"item_id": "item-1", "pluggy_account_id": "acc-1",
               "pluggy_type": "BANK", "account_id": 1, "sync_from": "2026-08-01"}
    r = client.post("/api/pluggy/links", json=payload)
    assert r.status_code == 201
    link_id = r.json()["id"]
    assert r.json()["sync_from"] == "2026-08-01"
    assert r.json()["last_synced_at"] is None

    r2 = client.post("/api/pluggy/links", json=payload)
    assert r2.status_code == 409  # conta Pluggy já vinculada

    assert client.delete(f"/api/pluggy/links/{link_id}").status_code == 204
    assert client.delete(f"/api/pluggy/links/{link_id}").status_code == 404


def test_vinculo_valida_payload(client):
    base = {"item_id": "i", "pluggy_account_id": "a", "pluggy_type": "BANK",
            "account_id": 1, "sync_from": "2026-08-01"}
    assert client.post("/api/pluggy/links", json={**base, "pluggy_type": "X"}).status_code == 400
    assert client.post("/api/pluggy/links", json={**base, "account_id": 999}).status_code == 404
    assert client.post("/api/pluggy/links", json={**base, "sync_from": "16/08/2026"}).status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_api_pluggy.py -v`
Expected: FAIL (404 nos endpoints — router não existe)

- [ ] **Step 3: Write the implementation**

Em `backend/app/schemas.py`, adicionar:

```python
class PluggyLinkIn(BaseModel):
    item_id: str
    pluggy_account_id: str
    pluggy_type: str  # "BANK" | "CREDIT"
    account_id: int
    sync_from: str  # "YYYY-MM-DD"
```

Criar `backend/app/routers/pluggy.py`:

```python
from datetime import date, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select

from app.db import get_session
from app.models import Account, PluggyLink, Transaction
from app.schemas import PluggyLinkIn
from app.services.pluggy import PluggyError, get_pluggy

router = APIRouter(prefix="/api/pluggy")

_SEM_CREDENCIAL = (
    "Credencial Pluggy ausente — defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET "
    "em backend/.env e reinicie"
)


def _link_out(link: PluggyLink) -> dict:
    return {
        "id": link.id,
        "item_id": link.item_id,
        "pluggy_account_id": link.pluggy_account_id,
        "pluggy_type": link.pluggy_type,
        "account_id": link.account_id,
        "sync_from": link.sync_from.isoformat(),
        "last_synced_at": (
            link.last_synced_at.replace(tzinfo=timezone.utc).isoformat()
            if link.last_synced_at
            else None
        ),
    }


@router.get("/links")
def list_links(session=Depends(get_session), client=Depends(get_pluggy)):
    # última transação por conta local: a UI sugere sync_from = dia seguinte
    last = session.execute(
        select(Transaction.account_id, func.max(Transaction.date))
        .group_by(Transaction.account_id)
    ).all()
    return {
        "credential_set": client is not None,
        "links": [
            _link_out(l)
            for l in session.scalars(select(PluggyLink).order_by(PluggyLink.id))
        ],
        "last_tx_dates": {str(acc): d.isoformat() for acc, d in last},
    }


@router.get("/items/{item_id}/accounts")
def item_accounts(item_id: str, client=Depends(get_pluggy)):
    if client is None:
        raise HTTPException(503, _SEM_CREDENCIAL)
    try:
        item = client.get_item(item_id)
        accounts = client.get_accounts(item_id)
    except PluggyError as e:
        raise HTTPException(404 if e.status == 404 else 502, str(e))
    return {
        "item_status": item.get("status"),
        "connector": (item.get("connector") or {}).get("name"),
        "accounts": [
            {
                "id": a["id"],
                "type": a.get("type"),
                "subtype": a.get("subtype"),
                "name": a.get("name"),
                "number": a.get("number"),
            }
            for a in accounts
        ],
    }


@router.post("/links", status_code=201)
def create_link(payload: PluggyLinkIn, session=Depends(get_session)):
    if payload.pluggy_type not in ("BANK", "CREDIT"):
        raise HTTPException(400, "pluggy_type deve ser 'BANK' ou 'CREDIT'")
    if not session.get(Account, payload.account_id):
        raise HTTPException(404, "Conta não encontrada")
    try:
        sync_from = date.fromisoformat(payload.sync_from)
    except ValueError:
        raise HTTPException(400, "sync_from deve ser YYYY-MM-DD")
    if session.scalar(
        select(PluggyLink).where(PluggyLink.pluggy_account_id == payload.pluggy_account_id)
    ):
        raise HTTPException(409, "Essa conta Pluggy já está vinculada")
    link = PluggyLink(
        item_id=payload.item_id,
        pluggy_account_id=payload.pluggy_account_id,
        pluggy_type=payload.pluggy_type,
        account_id=payload.account_id,
        sync_from=sync_from,
    )
    session.add(link)
    session.commit()
    return _link_out(link)


@router.delete("/links/{link_id}", status_code=204)
def delete_link(link_id: int, session=Depends(get_session)):
    link = session.get(PluggyLink, link_id)
    if not link:
        raise HTTPException(404, "Vínculo não encontrado")
    session.delete(link)
    session.commit()
```

Em `backend/app/main.py`:

```python
from app.routers import budgets, dashboard, imports, meta, pluggy, transactions
```

e, junto dos outros:

```python
    app.include_router(pluggy.router)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_api_pluggy.py -v`
Expected: todos PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/pluggy.py backend/app/schemas.py backend/app/main.py backend/tests/test_api_pluggy.py
git commit -m "feat(pluggy): endpoints de vinculo e descoberta de contas do item"
```

---

### Task 6: Endpoint de sync — `POST /api/pluggy/sync`

**Files:**
- Modify: `backend/app/routers/pluggy.py`
- Test: `backend/tests/test_api_pluggy.py` (acrescentar)

- [ ] **Step 1: Write the failing tests** (acrescentar em `backend/tests/test_api_pluggy.py`)

```python
def _mk_link(session, pluggy_id="acc-1", account_id=1):
    session.add(PluggyLink(item_id="item-1", pluggy_account_id=pluggy_id,
                           pluggy_type="BANK", account_id=account_id,
                           sync_from=date(2026, 8, 1)))
    session.commit()


def _tx(id="t1", amount=-19.9, desc="UBER TRIP"):
    return {"id": id, "description": desc, "descriptionRaw": None,
            "amount": amount, "date": "2026-08-10T03:00:00.000Z",
            "type": "DEBIT", "status": "POSTED", "currencyCode": "BRL"}


def test_sync_sem_credencial_503(client):
    assert client.post("/api/pluggy/sync").status_code == 503


def test_sync_sem_vinculo_400(client):
    use_fake(client, FakePluggyApi())
    r = client.post("/api/pluggy/sync")
    assert r.status_code == 400
    assert "vincule" in r.json()["detail"].lower()


def test_sync_cria_lote_e_responde_como_import(client, session):
    _mk_link(session)
    use_fake(client, FakePluggyApi(txs={"acc-1": [_tx(), _tx(id="t2", amount=-5.0, desc="PADARIA")]}))
    r = client.post("/api/pluggy/sync")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["new_count"] == 2
    assert body[0]["dup_count"] == 0
    assert body[0]["skipped_currency"] == 0
    assert body[0]["filename"].startswith("Pluggy · ")
    # sem ANTHROPIC_API_KEY nos testes o job nasce "done" (LLM é acessório)
    assert body[0]["classification"]["status"] == "done"
    # o lote aparece no histórico normal, com o Desfazer de sempre
    hist = client.get("/api/imports").json()
    assert hist[0]["source"] == "pluggy"
    assert client.delete(f"/api/imports/{body[0]['batch_id']}").status_code == 204


def test_sync_erro_parcial_nao_aborta(client, session):
    _mk_link(session, pluggy_id="acc-1", account_id=1)
    _mk_link(session, pluggy_id="acc-2", account_id=2)

    class Meio(FakePluggyApi):
        def get_transactions(self, account_id, date_from, date_to):
            if account_id == "acc-1":
                raise PluggyError("Pluggy respondeu 500", 500)
            return [_tx()]

    use_fake(client, Meio())
    body = client.post("/api/pluggy/sync").json()
    assert "error" in body[0]
    assert body[1]["new_count"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_api_pluggy.py -v`
Expected: novos FAIL (405/404 no POST /sync)

- [ ] **Step 3: Write the implementation** (acrescentar em `backend/app/routers/pluggy.py`)

Imports adicionais no topo do arquivo:

```python
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.services.classifier import apply_rules
from app.services.classify_job import JOBS, job_status, prune_jobs, run_classification
from app.services.llm import get_llm
from app.services.pluggy_sync import sync_all
```

Endpoint (mesmo padrão do `POST /imports`: job em background, `GET /imports/{id}/classification` já existe para o polling):

```python
@router.post("/sync")
def sync(
    background_tasks: BackgroundTasks,
    session=Depends(get_session),
    client=Depends(get_pluggy),
):
    if client is None:
        raise HTTPException(503, _SEM_CREDENCIAL)
    if not session.scalar(select(PluggyLink.id)):
        raise HTTPException(400, "Nenhuma conta vinculada — vincule em Configurações")
    results = sync_all(session, client)
    llm = get_llm(session)
    for r in results:
        if "error" not in r:
            _, r["pending"] = apply_rules(session, r["new"])
    session.commit()
    out = []
    for r in results:
        if "error" in r:
            out.append({"link_id": r["link_id"], "account": r["account"], "error": r["error"]})
            continue
        batch = r["batch"]
        if r["pending"] and llm is not None:
            JOBS[batch.id] = "running"
            background_tasks.add_task(run_classification, batch.id)
        else:
            JOBS[batch.id] = "done"
        out.append({
            "link_id": r["link_id"],
            "account": r["account"],
            "batch_id": batch.id,
            "filename": batch.filename,
            "new_count": batch.new_count,
            "dup_count": batch.dup_count,
            "skipped_currency": r["skipped_currency"],
            "classification": job_status(session, batch.id),
        })
    prune_jobs()
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_api_pluggy.py -v`
Expected: todos PASS

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: tudo verde

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/pluggy.py backend/tests/test_api_pluggy.py
git commit -m "feat(pluggy): endpoint de sync com classificacao em background"
```

---

### Task 7: Frontend — types, hooks e libs (`pluggy.ts`, `batchBadge`)

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/hooks.ts`
- Create: `frontend/src/lib/pluggy.ts`
- Modify: `frontend/src/lib/imports.ts`
- Modify: `frontend/src/components/imports/HistoryCard.tsx`
- Test: `frontend/src/lib/pluggy.test.ts` (novo), `frontend/src/lib/imports.test.ts` (acrescentar)

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/pluggy.test.ts
import { describe, expect, it } from "vitest";

import { syncFromSuggestion, todayISO } from "./pluggy";

describe("todayISO", () => {
  it("formata a data local em YYYY-MM-DD", () => {
    expect(todayISO(new Date(2026, 7, 16, 23, 30))).toBe("2026-08-16");
  });
});

describe("syncFromSuggestion", () => {
  it("sugere o dia seguinte à última transação", () => {
    expect(syncFromSuggestion("2026-07-30", "2026-08-16")).toBe("2026-07-31");
  });
  it("vira o mês corretamente", () => {
    expect(syncFromSuggestion("2026-07-31", "2026-08-16")).toBe("2026-08-01");
  });
  it("conta sem transações sugere hoje", () => {
    expect(syncFromSuggestion(undefined, "2026-08-16")).toBe("2026-08-16");
  });
});
```

Acrescentar em `frontend/src/lib/imports.test.ts`:

```ts
import { batchBadge } from "./imports";

describe("batchBadge", () => {
  it("lote pluggy ganha badge OF (filename sintético não tem extensão)", () => {
    expect(batchBadge({ source: "pluggy", filename: "Pluggy · Bradesco Conta · 2026-08-16" })).toBe("OF");
  });
  it("lote de arquivo continua usando a extensão", () => {
    expect(batchBadge({ source: "ofx", filename: "extrato.ofx" })).toBe("OFX");
  });
});
```

(Se o arquivo já importa de `"./imports"`, apenas acrescente `batchBadge` ao import existente e o `describe` no fim.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/pluggy.test.ts src/lib/imports.test.ts`
Expected: FAIL (módulo `./pluggy` não existe; `batchBadge` não exportado)

- [ ] **Step 3: Write the implementations**

```ts
// frontend/src/lib/pluggy.ts

/** Data local em YYYY-MM-DD — toISOString() usaria UTC e viraria o dia à noite. */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * Sugestão de "sincronizar a partir de": dia seguinte à última transação da
 * conta local — protege o histórico importado por arquivo (o dedupe não cruza
 * fontes: a descrição da Pluggy difere da do OFX). Conta sem transações: hoje.
 */
export function syncFromSuggestion(lastTx: string | undefined, today: string): string {
  if (!lastTx) return today;
  const d = new Date(`${lastTx}T12:00:00`); // meio-dia evita surpresa de fuso
  d.setDate(d.getDate() + 1);
  return todayISO(d);
}
```

Em `frontend/src/lib/imports.ts`, adicionar após `fileBadge`:

```ts
/** Badge do histórico: lote Pluggy não tem extensão de arquivo — a origem manda. */
export function batchBadge(b: Pick<ImportBatch, "source" | "filename">): string {
  return b.source === "pluggy" ? "OF" : fileBadge(b.filename);
}
```

Em `frontend/src/components/imports/HistoryCard.tsx`, trocar o import de `fileBadge` por `batchBadge` e usar `{batchBadge(b)}` na linha do histórico (antes: `{fileBadge(b.filename)}`).

Em `frontend/src/api/types.ts`, adicionar ao final:

```ts
export interface PluggyAccount {
  id: string;
  type: "BANK" | "CREDIT";
  subtype: string | null;
  name: string | null;
  number: string | null;
}

export interface PluggyItemAccounts {
  item_status: string | null;
  connector: string | null;
  accounts: PluggyAccount[];
}

export interface PluggyLink {
  id: number;
  item_id: string;
  pluggy_account_id: string;
  pluggy_type: "BANK" | "CREDIT";
  account_id: number;
  sync_from: string;
  last_synced_at: string | null;
}

export interface PluggyStatus {
  credential_set: boolean;
  links: PluggyLink[];
  /** account_id local (como string) → data ISO da última transação da conta */
  last_tx_dates: Record<string, string>;
}

/** Elemento da resposta de POST /pluggy/sync: sucesso tem cara de ImportResult. */
export interface SyncResult {
  link_id: number;
  account: string;
  batch_id?: number;
  filename?: string;
  new_count?: number;
  dup_count?: number;
  skipped_currency?: number;
  classification?: ClassificationProgress;
  error?: string;
}
```

Em `frontend/src/api/hooks.ts`, adicionar `PluggyStatus` ao import de types e, junto das outras queries/mutations:

```ts
export const usePluggyStatus = () =>
  useQuery({
    queryKey: ["pluggy-status"],
    queryFn: () => api<PluggyStatus>("/pluggy/links"),
  });

export const useCreatePluggyLink = () =>
  useInvalidatingMutation(
    (payload: {
      item_id: string;
      pluggy_account_id: string;
      pluggy_type: string;
      account_id: number;
      sync_from: string;
    }) => api("/pluggy/links", jsonBody("POST", payload))
  );

export const useDeletePluggyLink = () =>
  useInvalidatingMutation((id: number) =>
    api(`/pluggy/links/${id}`, { method: "DELETE" })
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run`
Expected: suíte inteira verde (163 + novos)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/hooks.ts frontend/src/lib/pluggy.ts frontend/src/lib/pluggy.test.ts frontend/src/lib/imports.ts frontend/src/lib/imports.test.ts frontend/src/components/imports/HistoryCard.tsx
git commit -m "feat(pluggy): types/hooks, sugestao de corte e badge OF no historico"
```

---

### Task 8: Frontend — card Open Finance em Configurações

**Files:**
- Create: `frontend/src/components/settings/PluggyCard.tsx`
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/styles/pages.css`

Sem teste unitário próprio: o componente é casca fina sobre as libs/hooks já testados (padrão das outras telas — a lógica testável ficou em `lib/pluggy.ts`). Verificação visual no Task 10.

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/settings/PluggyCard.tsx
import { useState } from "react";

import { api } from "../../api/client";
import {
  useAccounts,
  useCreatePluggyLink,
  useDeletePluggyLink,
  usePluggyStatus,
} from "../../api/hooks";
import type { PluggyItemAccounts } from "../../api/types";
import { whenLabel } from "../../lib/imports";
import { syncFromSuggestion, todayISO } from "../../lib/pluggy";

/** Status de item que exigem ação do usuário no portal da Pluggy. */
const PROBLEM_STATUSES = ["LOGIN_ERROR", "WAITING_USER_INPUT", "OUTDATED"];

export default function PluggyCard() {
  const { data: status } = usePluggyStatus();
  const { data: accounts } = useAccounts();
  const createLink = useCreatePluggyLink();
  const deleteLink = useDeletePluggyLink();
  const [itemId, setItemId] = useState("");
  const [lookupItemId, setLookupItemId] = useState("");
  const [item, setItem] = useState<PluggyItemAccounts | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // escolhas por conta Pluggy ainda não vinculada: conta local + data de corte
  const [choices, setChoices] = useState<
    Record<string, { accountId: string; syncFrom: string }>
  >({});

  if (!status) return null;
  const locals = accounts ?? [];
  const linked = new Set(status.links.map((l) => l.pluggy_account_id));
  const unlinked = item ? item.accounts.filter((a) => !linked.has(a.id)) : [];

  async function lookup() {
    const id = itemId.trim();
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api<PluggyItemAccounts>(`/pluggy/items/${id}/accounts`);
      setItem(data);
      setLookupItemId(id);
      setChoices({});
    } catch (e) {
      setItem(null);
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Open Finance (Pluggy)</h2>
        <span className={status.credential_set ? "set-key-pill" : "set-key-pill is-missing"}>
          <span className="set-key-dot" />
          {status.credential_set
            ? "Credencial Pluggy configurada"
            : "sem credencial — defina PLUGGY_CLIENT_ID/SECRET em backend/.env e reinicie"}
        </span>
      </div>

      <p className="note">
        Conecte seus bancos em meu.pluggy.ai, vincule a conexão à sua aplicação no
        dashboard.pluggy.ai e cole aqui o Item ID para vincular as contas.
      </p>

      {status.credential_set && (
        <div className="plg-form">
          <input
            className="mono"
            placeholder="Item ID do dashboard da Pluggy"
            value={itemId}
            aria-label="Item ID da Pluggy"
            onChange={(e) => setItemId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
          />
          <button type="button" disabled={busy || !itemId.trim()} onClick={lookup}>
            {busy ? "Buscando…" : "Buscar contas"}
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {item && item.item_status && PROBLEM_STATUSES.includes(item.item_status) && (
        <p className="error">
          Conexão com status {item.item_status} — reconecte a conta no meu.pluggy.ai.
        </p>
      )}

      {item && unlinked.length === 0 && (
        <p className="note">Todas as contas deste item já estão vinculadas.</p>
      )}

      {unlinked.map((a) => {
        const c = choices[a.id];
        return (
          <div key={a.id} className="plg-row">
            <div>
              <div>{a.name ?? a.subtype ?? a.id}</div>
              <div className="note mono">
                {a.type}
                {a.number ? ` · ${a.number}` : ""}
              </div>
            </div>
            <select
              aria-label={`Conta local para ${a.name ?? a.id}`}
              value={c?.accountId ?? ""}
              onChange={(e) =>
                setChoices({
                  ...choices,
                  [a.id]: {
                    accountId: e.target.value,
                    syncFrom: syncFromSuggestion(
                      status.last_tx_dates[e.target.value],
                      todayISO()
                    ),
                  },
                })
              }
            >
              <option value="">vincular a…</option>
              {locals.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.name}
                </option>
              ))}
            </select>
            <label className="note">
              a partir de{" "}
              <input
                type="date"
                aria-label={`Sincronizar a partir de (${a.name ?? a.id})`}
                value={c?.syncFrom ?? ""}
                disabled={!c}
                onChange={(e) =>
                  c && setChoices({ ...choices, [a.id]: { ...c, syncFrom: e.target.value } })
                }
              />
            </label>
            <button
              type="button"
              className="primary"
              disabled={!c || !c.accountId || !c.syncFrom || createLink.isPending}
              onClick={() =>
                c &&
                createLink.mutate({
                  item_id: lookupItemId,
                  pluggy_account_id: a.id,
                  pluggy_type: a.type,
                  account_id: Number(c.accountId),
                  sync_from: c.syncFrom,
                })
              }
            >
              Vincular
            </button>
          </div>
        );
      })}

      {status.links.length > 0 && (
        <>
          <div className="label plg-links-label">Contas vinculadas</div>
          {status.links.map((l) => {
            const local = locals.find((x) => x.id === l.account_id);
            return (
              <div key={l.id} className="plg-row">
                <div>
                  <div>{local?.name ?? `conta ${l.account_id}`}</div>
                  <div className="note mono">
                    {l.pluggy_type} · desde {l.sync_from}
                  </div>
                </div>
                <span className="note">
                  {l.last_synced_at
                    ? `última sync ${whenLabel(l.last_synced_at)}`
                    : "nunca sincronizada"}
                </span>
                <button
                  type="button"
                  disabled={deleteLink.isPending}
                  onClick={() =>
                    window.confirm(
                      `Remover o vínculo de ${local?.name ?? l.pluggy_account_id}? As transações já importadas ficam.`
                    ) && deleteLink.mutate(l.id)
                  }
                >
                  Remover
                </button>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire into Settings page**

`frontend/src/pages/Settings.tsx`:

```tsx
import PageHeader from "../components/PageHeader";
import AccountsRail from "../components/settings/AccountsRail";
import CategoriesCard from "../components/settings/CategoriesCard";
import LlmCard from "../components/settings/LlmCard";
import PluggyCard from "../components/settings/PluggyCard";
import RulesCard from "../components/settings/RulesCard";

export default function Settings() {
  return (
    <div className="settings-page">
      <PageHeader eyebrow="Configurações" title="Como o app classifica" />
      <LlmCard />
      <section className="set-grid">
        <CategoriesCard />
        <AccountsRail />
      </section>
      <PluggyCard />
      <RulesCard />
    </div>
  );
}
```

- [ ] **Step 3: CSS**

Acrescentar em `frontend/src/styles/pages.css` (junto das regras `set-*` de Configurações):

```css
/* ---- Configurações · Open Finance (Pluggy) ---- */
.plg-form {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.plg-form input {
  flex: 1;
}
.plg-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--divider);
}
.plg-links-label {
  margin-top: 16px;
}
```

- [ ] **Step 4: Verify it compiles and the suite stays green**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: sem erros de tipo; suíte verde

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/PluggyCard.tsx frontend/src/pages/Settings.tsx frontend/src/styles/pages.css
git commit -m "feat(pluggy): card Open Finance em Configuracoes com vinculo de contas"
```

---

### Task 9: Frontend — card Sincronizar em Importar

**Files:**
- Create: `frontend/src/components/imports/SyncCard.tsx`
- Modify: `frontend/src/pages/Imports.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/imports/SyncCard.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import { usePluggyStatus } from "../../api/hooks";
import type { ImportResult, SyncResult } from "../../api/types";
import ResultCard from "./ResultCard";

/**
 * Botão Sincronizar do Open Finance. O resultado por conta tem a mesma cara do
 * import por arquivo, então reusa o ResultCard (com o polling de classificação).
 */
export default function SyncCard() {
  const { data: status } = usePluggyStatus();
  const queryClient = useQueryClient();
  const [results, setResults] = useState<SyncResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status) return null;
  const ready = status.credential_set && status.links.length > 0;

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<SyncResult[]>("/pluggy/sync", { method: "POST" });
      setResults((prev) => [...prev, ...r]);
      queryClient.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const ok = results.filter((r) => r.batch_id !== undefined);
  const failed = results.filter((r) => r.error);

  return (
    <section className="card">
      <div className="imp-head">
        <h2>Open Finance</h2>
        <span className="note">
          {status.links.length > 0
            ? `${status.links.length} ${status.links.length === 1 ? "conta vinculada" : "contas vinculadas"}`
            : "nenhuma conta vinculada"}
        </span>
      </div>
      <div className="imp-run">
        <button type="button" className="primary" disabled={!ready || busy} onClick={run}>
          {busy ? "Sincronizando…" : "Sincronizar"}
        </button>
        {!ready && (
          <span className="note">
            {status.credential_set ? (
              <>
                vincule suas contas em <Link to="/config">Configurações</Link>
              </>
            ) : (
              <>
                configure PLUGGY_CLIENT_ID/SECRET em backend/.env e vincule as contas em{" "}
                <Link to="/config">Configurações</Link>
              </>
            )}
          </span>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {failed.map((r, i) => (
        <p key={`${r.link_id}-${i}`} className="error">
          {r.account}: {r.error}
        </p>
      ))}
      {ok.map((r) => (
        <ResultCard
          key={r.batch_id}
          r={r as ImportResult}
          onClose={() => setResults(results.filter((x) => x !== r))}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Wire into Imports page**

`frontend/src/pages/Imports.tsx`:

```tsx
import { useAccounts } from "../api/hooks";
import ClassifyCard from "../components/imports/ClassifyCard";
import HistoryCard from "../components/imports/HistoryCard";
import SyncCard from "../components/imports/SyncCard";
import UploadCard from "../components/imports/UploadCard";
import PageHeader from "../components/PageHeader";

export default function Imports() {
  const { data: accounts } = useAccounts();

  return (
    <div className="imports-page">
      <PageHeader eyebrow="Importar" title="Extratos" />
      <SyncCard />
      <section className="imp-grid">
        <UploadCard accounts={accounts ?? []} />
        <ClassifyCard />
      </section>
      <HistoryCard />
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles and the suite stays green**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: sem erros de tipo; suíte verde

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/imports/SyncCard.tsx frontend/src/pages/Imports.tsx
git commit -m "feat(pluggy): card Sincronizar na tela Importar"
```

---

### Task 10: Verificação final

**Files:** nenhum novo (build + verificação)

- [ ] **Step 1: Suites completas**

Run: `cd backend && python -m pytest -q && cd ../frontend && npx vitest run`
Expected: tudo verde (backend ~140, frontend ~170)

- [ ] **Step 2: Build do frontend** (o usuário acessa via localhost:8000, que serve `frontend/dist`)

Run: `cd frontend && npm run build`
Expected: build sem erros

- [ ] **Step 3: Verificação visual com Playwright** (skill webapp-testing; servidor de teste em porta ≠ 8000 — NUNCA usar a 8000, é o uvicorn do usuário)

- Subir uvicorn de teste com banco descartável (ex.: `DB_PATH=/tmp/teste-pluggy.db uvicorn app.main:app --port 8100` a partir de `backend/`).
- Configurações: card "Open Finance (Pluggy)" com pill "sem credencial" (sem PLUGGY_* no ambiente de teste).
- Importar: card "Open Finance" com botão desabilitado e dica apontando Configurações.
- Histórico: lotes de arquivo continuam com badge de extensão.
- Temas claro e escuro.

- [ ] **Step 4: Commit final (se a verificação gerar ajustes) e revisão única**

Uma revisão de código ao final do plano inteiro (regra da casa: sem revisor por task) — skill superpowers:requesting-code-review, comparando contra a spec `2026-08-16-pluggy-connector-design.md`.

- [ ] **Step 5: Passos que ficam com o usuário (documentar no resumo final)**

1. Criar conta em meu.pluggy.ai e conectar o Bradesco (consentimento Open Finance).
2. Criar aplicação em dashboard.pluggy.ai, vincular a conexão, copiar `clientId`/`clientSecret` para `backend/.env` (`PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET`) e o Item ID.
3. Reiniciar o uvicorn (`./run.sh`), vincular as contas em Configurações e rodar o primeiro Sincronizar.
4. **Validar a convenção de sinal com dados reais** (ponto de atenção da spec): conferir alguns lançamentos de conta e de cartão; primeiro sync reversível via Desfazer.
