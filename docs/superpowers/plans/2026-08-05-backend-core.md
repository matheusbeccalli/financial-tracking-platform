# Backend Core (Fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend completo da plataforma financeira: SQLite + ingestão OFX/CSV (Bradesco/Inter) com dedup, classificação em cascata (regras → LLM Anthropic configurável), orçamento de fluxo de caixa com vigência, bridge orçado→realizado e API REST — tudo coberto por pytest.

**Architecture:** Processo único FastAPI (`backend/app/`), SQLAlchemy 2.0 sobre SQLite, serviços puros (importer/classifier/budget) separados dos routers, LLM atrás de interface mockável. Este é o Plano 1 de 2 — o frontend React vira plano próprio quando a API existir.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, pydantic-settings, ofxparse, anthropic, pytest + httpx.

**Spec:** `docs/superpowers/specs/2026-08-04-financial-platform-design.md`

**Convenções (valem para todos os tasks):**
- Valores monetários em **centavos** (int, negativo = saída).
- Meses como string `"YYYY-MM"` (comparação lexicográfica funciona).
- Rodar comandos a partir de `backend/` usando `.venv/bin/...`.
- Branch de trabalho: `feature/backend-core` (criada no Task 1).

---

### Task 1: Scaffold do projeto

**Files:**
- Create: `backend/requirements.txt`, `backend/pyproject.toml`, `backend/app/__init__.py`, `backend/app/main.py`, `backend/tests/__init__.py`, `backend/tests/test_health.py`, `run.sh`, `backend/.env.example`

- [ ] **Step 1: Branch e estrutura**

```bash
cd /home/mathe/programming/financial-tracking-platform
git checkout -b feature/backend-core
mkdir -p backend/app backend/tests
touch backend/app/__init__.py backend/tests/__init__.py
```

- [ ] **Step 2: Arquivos de configuração**

`backend/requirements.txt`:
```
fastapi
uvicorn[standard]
sqlalchemy>=2.0
pydantic-settings
python-multipart
ofxparse
anthropic
pytest
httpx
```

`backend/pyproject.toml`:
```toml
[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

`backend/.env.example`:
```
ANTHROPIC_API_KEY=
DB_PATH=financas.db
```

`run.sh` (na raiz; depois: `chmod +x run.sh`):
```bash
#!/usr/bin/env bash
cd "$(dirname "$0")/backend"
.venv/bin/uvicorn app.main:app --port 8000 "$@"
```

- [ ] **Step 3: venv e instalação**

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

- [ ] **Step 4: Teste que falha**

`backend/tests/test_health.py`:
```python
from fastapi.testclient import TestClient
from app.main import create_app


def test_health():
    client = TestClient(create_app())
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```

Run: `.venv/bin/pytest tests/test_health.py -v` — Expected: FAIL (`create_app` não existe).

- [ ] **Step 5: Implementação mínima**

`backend/app/main.py`:
```python
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="Financas")

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 6: Verificar e commitar**

Run: `.venv/bin/pytest -v` — Expected: 1 passed.

```bash
git add backend run.sh
git commit -m "build: scaffold FastAPI backend with venv and health check"
```

---

### Task 2: Config, banco, modelos e seed

**Files:**
- Create: `backend/app/config.py`, `backend/app/db.py`, `backend/app/models.py`, `backend/app/seed.py`, `backend/tests/conftest.py`, `backend/tests/test_models_seed.py`

- [ ] **Step 1: Teste que falha**

`backend/tests/conftest.py`:
```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base
from app.seed import seed


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    with Session() as s:
        seed(s)
        s.commit()
        yield s
```

`backend/tests/test_models_seed.py`:
```python
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
```

Run: `.venv/bin/pytest tests/test_models_seed.py -v` — Expected: FAIL (import error).

- [ ] **Step 2: Implementação**

`backend/app/config.py`:
```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    db_path: str = "financas.db"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
```

`backend/app/models.py`:
```python
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "account"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    institution: Mapped[str]  # "bradesco" | "inter"
    kind: Mapped[str]  # "corrente" | "cartao"


class Category(Base):
    __tablename__ = "category"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    color: Mapped[str] = mapped_column(default="#8888aa")
    kind: Mapped[str]  # "entrada" | "saida"
    archived: Mapped[bool] = mapped_column(default=False)


class ImportBatch(Base):
    __tablename__ = "import_batch"
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str]  # "ofx" | "csv"
    filename: Mapped[str]
    imported_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    new_count: Mapped[int] = mapped_column(default=0)
    dup_count: Mapped[int] = mapped_column(default=0)


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("account.id"))
    date: Mapped[date] = mapped_column(Date)
    description: Mapped[str]
    normalized: Mapped[str]
    amount_cents: Mapped[int]
    category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("category.id"))
    source: Mapped[Optional[str]]  # "regra" | "llm" | "manual"
    dedupe_hash: Mapped[str] = mapped_column(unique=True)
    batch_id: Mapped[Optional[int]] = mapped_column(ForeignKey("import_batch.id"))
    installment: Mapped[Optional[str]]  # ex.: "02/10"
    ignored: Mapped[bool] = mapped_column(default=False)


class Rule(Base):
    __tablename__ = "rule"
    id: Mapped[int] = mapped_column(primary_key=True)
    matcher: Mapped[str] = mapped_column(unique=True)  # descrição normalizada
    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"))


class Budget(Base):
    __tablename__ = "budget"
    __table_args__ = (UniqueConstraint("category_id", "valid_from"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"))
    amount_cents: Mapped[int]  # sempre positivo; sinal vem do kind da categoria
    valid_from: Mapped[str]  # "YYYY-MM"


class Setting(Base):
    __tablename__ = "setting"
    key: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[str]
```

`backend/app/db.py`:
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import Base

engine = create_engine(
    f"sqlite:///{settings.db_path}", connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(bind=engine)


def get_session():
    with SessionLocal() as session:
        yield session


def init_db():
    Base.metadata.create_all(engine)
```

`backend/app/seed.py`:
```python
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
```

- [ ] **Step 3: Verificar e commitar**

Run: `.venv/bin/pytest -v` — Expected: 4 passed.

```bash
git add backend/app backend/tests
git commit -m "feat(db): add SQLAlchemy models, config and idempotent seed"
```

---

### Task 3: Normalização de descrição e parcela

**Files:**
- Create: `backend/app/normalize.py`, `backend/tests/test_normalize.py`

- [ ] **Step 1: Teste que falha**

`backend/tests/test_normalize.py`:
```python
from app.normalize import extract_installment, normalize_description


def test_normalize_removes_digits_dates_and_accents():
    assert normalize_description("PAG*JoseSilva 123456") == "PAG*JOSESILVA"
    assert normalize_description("SUPERMERCADO PÃO DE AÇÚCAR 03/08") == (
        "SUPERMERCADO PAO DE ACUCAR"
    )
    assert normalize_description("  PIX  QR   CODE 9921 ") == "PIX QR CODE"


def test_extract_installment_by_parc_prefix():
    assert extract_installment("LOJAS RENNER PARC 02/10") == "02/10"


def test_extract_installment_at_end():
    assert extract_installment("MAGAZINELUIZA 3/6") == "3/6"


def test_no_installment_for_dates_or_plain_text():
    assert extract_installment("COMPRA 02/08 MERCADO CENTRAL") is None
    assert extract_installment("UBER TRIP") is None
```

Nota: `"3/6"` no fim casa a heurística (atual ≤ total, total ≥ 2); `"02/08 MERCADO"` não casa porque não está no fim nem tem prefixo PARC. Heurística é para **exibição** apenas.

Run: `.venv/bin/pytest tests/test_normalize.py -v` — Expected: FAIL.

- [ ] **Step 2: Implementação**

`backend/app/normalize.py`:
```python
import re
import unicodedata


def normalize_description(desc: str) -> str:
    s = unicodedata.normalize("NFKD", desc).encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Z*]+", " ", s.upper())
    return re.sub(r"\s+", " ", s).strip()


def extract_installment(desc: str) -> str | None:
    up = desc.upper()
    m = re.search(r"PARC\w*\s*(\d{1,2})\s*/\s*(\d{1,2})", up)
    if not m:
        m = re.search(r"(\d{1,2})\s*/\s*(\d{1,2})\s*$", up)
    if not m:
        return None
    cur, total = int(m.group(1)), int(m.group(2))
    if 1 <= cur <= total and total >= 2:
        return f"{m.group(1)}/{m.group(2)}"
    return None
```

- [ ] **Step 3: Verificar e commitar**

Run: `.venv/bin/pytest tests/test_normalize.py -v` — Expected: 4 passed.

```bash
git add backend/app/normalize.py backend/tests/test_normalize.py
git commit -m "feat(ingest): add description normalization and installment heuristic"
```

---

### Task 4: Hash de deduplicação

**Files:**
- Create: `backend/app/dedupe.py`, `backend/tests/test_dedupe.py`

- [ ] **Step 1: Teste que falha**

`backend/tests/test_dedupe.py`:
```python
from datetime import date

from app.dedupe import make_hash


def test_fitid_wins_over_fields():
    a = make_hash(1, "FIT123", date(2026, 7, 1), -100, "X")
    b = make_hash(1, "FIT123", date(2026, 7, 2), -999, "Y")
    assert a == b


def test_fallback_uses_fields():
    a = make_hash(1, None, date(2026, 7, 1), -100, "MERCADO")
    b = make_hash(1, None, date(2026, 7, 1), -100, "MERCADO")
    c = make_hash(1, None, date(2026, 7, 1), -101, "MERCADO")
    assert a == b and a != c


def test_account_scopes_hash():
    a = make_hash(1, "FIT123", date(2026, 7, 1), -100, "X")
    b = make_hash(2, "FIT123", date(2026, 7, 1), -100, "X")
    assert a != b
```

Run: `.venv/bin/pytest tests/test_dedupe.py -v` — Expected: FAIL.

- [ ] **Step 2: Implementação**

`backend/app/dedupe.py`:
```python
import hashlib
from datetime import date


def make_hash(
    account_id: int,
    fitid: str | None,
    d: date,
    amount_cents: int,
    description: str,
) -> str:
    if fitid:
        base = f"{account_id}|fitid|{fitid}"
    else:
        base = f"{account_id}|{d.isoformat()}|{amount_cents}|{description.strip().upper()}"
    return hashlib.sha256(base.encode()).hexdigest()
```

- [ ] **Step 3: Verificar e commitar**

Run: `.venv/bin/pytest tests/test_dedupe.py -v` — Expected: 3 passed.

```bash
git add backend/app/dedupe.py backend/tests/test_dedupe.py
git commit -m "feat(ingest): add dedupe hash keyed by FITID with field fallback"
```

---

### Task 5: Parser OFX (conta e cartão) com fixtures

**Files:**
- Create: `backend/app/parsers/__init__.py`, `backend/app/parsers/ofx.py`, `backend/tests/fixtures/bradesco_conta.ofx`, `backend/tests/fixtures/inter_cartao.ofx`, `backend/tests/test_parsers_ofx.py`

- [ ] **Step 1: Fixtures**

`backend/tests/fixtures/bradesco_conta.ofx` (ASCII, SGML OFX 1.02):
```
OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20260801<LANGUAGE>POR<FI><ORG>BRADESCO<FID>237</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>0237<BRANCHID>1234<ACCTID>567890<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260701<DTEND>20260731
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260703<TRNAMT>-187.40<FITID>N1001<MEMO>SUPERMERCADO PAO DE ACUCAR 123456</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260705<TRNAMT>8500.00<FITID>N1002<MEMO>SALARIO EMPRESA XYZ</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260710<TRNAMT>-2300.00<FITID>N1003<MEMO>PAGTO FATURA CARTAO</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>6012.60<DTASOF>20260731</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
```

`backend/tests/fixtures/inter_cartao.ofx`:
```
OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20260801<LANGUAGE>POR<FI><ORG>INTER<FID>077</FI></SONRS></SIGNONMSGSRSV1>
<CREDITCARDMSGSRSV1><CCSTMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<CCSTMTRS><CURDEF>BRL<CCACCTFROM><ACCTID>5502XXXXXXXX1234</CCACCTFROM>
<BANKTRANLIST><DTSTART>20260701<DTEND>20260731
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260702<TRNAMT>-89.90<FITID>C2001<MEMO>DL*AMAZONBR</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260715<TRNAMT>-120.00<FITID>C2002<MEMO>LOJAS RENNER PARC 02/04</STMTTRN>
</BANKTRANLIST>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>
```

- [ ] **Step 2: Teste que falha**

`backend/tests/test_parsers_ofx.py`:
```python
from datetime import date
from pathlib import Path

import pytest

from app.parsers import ParsedTransaction, parse_file

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_parse_bradesco_conta():
    txs = parse_file("bradesco_conta.ofx", load("bradesco_conta.ofx"))
    assert len(txs) == 3
    first = txs[0]
    assert first == ParsedTransaction(
        date=date(2026, 7, 3),
        description="SUPERMERCADO PAO DE ACUCAR 123456",
        amount_cents=-18740,
        fitid="N1001",
    )
    assert txs[1].amount_cents == 850000  # crédito de salário


def test_parse_inter_cartao():
    txs = parse_file("inter_cartao.ofx", load("inter_cartao.ofx"))
    assert len(txs) == 2
    assert txs[1].description == "LOJAS RENNER PARC 02/04"
    assert txs[1].amount_cents == -12000


def test_latin1_bytes_do_not_crash():
    content = load("bradesco_conta.ofx").replace(
        b"SUPERMERCADO PAO", b"FARMACIA S\xc3O JO\xc3O"
    )
    txs = parse_file("x.ofx", content)
    assert len(txs) == 3  # decodifica sem explodir


def test_invalid_file_raises_value_error():
    with pytest.raises(ValueError):
        parse_file("lixo.ofx", b"isto nao e um ofx")


def test_unknown_extension_raises():
    with pytest.raises(ValueError):
        parse_file("extrato.pdf", b"")
```

Run: `.venv/bin/pytest tests/test_parsers_ofx.py -v` — Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementação**

`backend/app/parsers/__init__.py`:
```python
from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class ParsedTransaction:
    date: date
    description: str
    amount_cents: int
    fitid: str | None = None


def parse_file(filename: str, content: bytes) -> list["ParsedTransaction"]:
    from app.parsers.csv_generic import parse_csv
    from app.parsers.ofx import parse_ofx

    lower = filename.lower()
    if lower.endswith(".ofx"):
        return parse_ofx(content)
    if lower.endswith(".csv"):
        return parse_csv(content)
    raise ValueError(f"Formato não suportado: {filename} (use .ofx ou .csv)")
```

`backend/app/parsers/ofx.py`:
```python
from decimal import ROUND_HALF_UP, Decimal
from io import BytesIO

from ofxparse import OfxParser

from app.parsers import ParsedTransaction


def to_cents(amount) -> int:
    return int(
        (Decimal(str(amount)) * 100).to_integral_value(rounding=ROUND_HALF_UP)
    )


def parse_ofx(content: bytes) -> list[ParsedTransaction]:
    try:
        ofx = OfxParser.parse(BytesIO(content))
        out: list[ParsedTransaction] = []
        for account in ofx.accounts:
            for t in account.statement.transactions:
                description = (t.memo or t.payee or "").strip()
                out.append(
                    ParsedTransaction(
                        date=t.date.date(),
                        description=description,
                        amount_cents=to_cents(t.amount),
                        fitid=(t.id or "").strip() or None,
                    )
                )
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"OFX inválido: {e}") from e
    if not out:
        raise ValueError("OFX sem transações reconhecíveis")
    return out
```

Nota: Task 6 cria `csv_generic.py`; até lá o import dentro de `parse_file` só quebra para arquivos `.csv` — os testes deste task não passam por esse caminho. Se `test_invalid_file_raises_value_error` falhar por o ofxparse aceitar o lixo silenciosamente, a proteção `if not out` cobre.

- [ ] **Step 4: Verificar e commitar**

Run: `.venv/bin/pytest tests/test_parsers_ofx.py -v` — Expected: 5 passed.

```bash
git add backend/app/parsers backend/tests/fixtures backend/tests/test_parsers_ofx.py
git commit -m "feat(ingest): add OFX parser for checking and credit card statements"
```

---

### Task 6: Parser CSV genérico

**Files:**
- Create: `backend/app/parsers/csv_generic.py`, `backend/tests/test_parsers_csv.py`

- [ ] **Step 1: Teste que falha**

`backend/tests/test_parsers_csv.py`:
```python
from datetime import date

import pytest

from app.parsers import parse_file

INTER_STYLE = """Extrato Conta Corrente
Conta: 123456-7

Data Lançamento;Descrição;Valor
01/07/2026;Pix enviado - Jose Silva;-45,00
05/07/2026;Salário Empresa XYZ;8.500,00
""".encode("utf-8")

BRADESCO_STYLE = """Data;Histórico;Valor
03/07/2026;SUPERMERCADO PAO DE ACUCAR;-187,40
""".encode("latin-1")


def test_parse_csv_with_preamble_and_brazilian_numbers():
    txs = parse_file("extrato.csv", INTER_STYLE)
    assert len(txs) == 2
    assert txs[0].date == date(2026, 7, 1)
    assert txs[0].amount_cents == -4500
    assert txs[1].amount_cents == 850000
    assert txs[0].fitid is None


def test_parse_csv_latin1_header_historico():
    txs = parse_file("extrato.csv", BRADESCO_STYLE)
    assert len(txs) == 1
    assert txs[0].description == "SUPERMERCADO PAO DE ACUCAR"


def test_csv_without_recognizable_header_raises():
    with pytest.raises(ValueError):
        parse_file("x.csv", b"foo;bar\n1;2\n")
```

Run: `.venv/bin/pytest tests/test_parsers_csv.py -v` — Expected: FAIL.

- [ ] **Step 2: Implementação**

`backend/app/parsers/csv_generic.py`:
```python
import csv
import io
import re
import unicodedata
from datetime import datetime

from app.parsers import ParsedTransaction

DESC_KEYS = ("descri", "historico", "lancamento", "titulo")


def _fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def _to_cents(raw: str) -> int:
    s = raw.strip().replace("R$", "").replace(" ", "")
    s = s.replace(".", "").replace(",", ".")
    return int(round(float(s) * 100))


def parse_csv(content: bytes) -> list[ParsedTransaction]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    lines = [l for l in text.splitlines() if l.strip()]

    header_idx = None
    for i, line in enumerate(lines):
        folded = _fold(line)
        if "data" in folded and "valor" in folded:
            header_idx = i
            break
    if header_idx is None:
        raise ValueError("CSV sem cabeçalho reconhecível (esperado colunas Data e Valor)")

    delimiter = ";" if ";" in lines[header_idx] else ","
    rows = list(csv.reader(io.StringIO("\n".join(lines[header_idx:])), delimiter=delimiter))
    header = [_fold(h) for h in rows[0]]

    def col(*keys):
        for i, h in enumerate(header):
            if any(k in h for k in keys):
                return i
        return None

    i_date, i_val = col("data"), col("valor")
    i_desc = col(*DESC_KEYS)
    if i_desc is None:
        raise ValueError("CSV sem coluna de descrição/histórico")

    out: list[ParsedTransaction] = []
    for row in rows[1:]:
        if len(row) <= max(i_date, i_val, i_desc):
            continue
        raw_date = row[i_date].strip()
        if not re.match(r"\d{2}/\d{2}/\d{4}$", raw_date):
            continue
        out.append(
            ParsedTransaction(
                date=datetime.strptime(raw_date, "%d/%m/%Y").date(),
                description=row[i_desc].strip(),
                amount_cents=_to_cents(row[i_val]),
            )
        )
    if not out:
        raise ValueError("CSV sem linhas de transação válidas")
    return out
```

- [ ] **Step 3: Verificar e commitar**

Run: `.venv/bin/pytest tests/test_parsers_csv.py -v` — Expected: 3 passed.

```bash
git add backend/app/parsers/csv_generic.py backend/tests/test_parsers_csv.py
git commit -m "feat(ingest): add generic CSV parser with Brazilian number/date formats"
```

---

### Task 7: Serviço de importação (atômico, dedup, ignoradas)

**Files:**
- Create: `backend/app/services/__init__.py`, `backend/app/services/importer.py`, `backend/tests/test_importer.py`

- [ ] **Step 1: Teste que falha**

`backend/tests/test_importer.py`:
```python
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models import ImportBatch, Transaction
from app.services.importer import import_file, undo_batch

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_import_creates_transactions_and_batch(session):
    batch, new = import_file(session, 1, "bradesco_conta.ofx", load("bradesco_conta.ofx"))
    session.commit()
    assert batch.new_count == 3 and batch.dup_count == 0
    assert len(new) == 3
    tx = session.scalar(select(Transaction).where(Transaction.amount_cents == -18740))
    assert tx.normalized == "SUPERMERCADO PAO DE ACUCAR"
    assert tx.category_id is None and tx.source is None


def test_reimport_is_fully_deduplicated(session):
    import_file(session, 1, "a.ofx", load("bradesco_conta.ofx"))
    session.commit()
    batch2, new2 = import_file(session, 1, "b.ofx", load("bradesco_conta.ofx"))
    session.commit()
    assert batch2.new_count == 0 and batch2.dup_count == 3
    assert new2 == []
    assert session.scalar(select(func.count()).select_from(Transaction)) == 3


def test_fatura_payment_is_ignored_and_installment_extracted(session):
    import_file(session, 1, "a.ofx", load("bradesco_conta.ofx"))
    import_file(session, 4, "b.ofx", load("inter_cartao.ofx"))
    session.commit()
    fatura = session.scalar(
        select(Transaction).where(Transaction.normalized.contains("PAGTO FATURA"))
    )
    assert fatura.ignored is True
    renner = session.scalar(
        select(Transaction).where(Transaction.normalized.contains("RENNER"))
    )
    assert renner.installment == "02/04" and renner.ignored is False


def test_invalid_file_writes_nothing(session):
    with pytest.raises(ValueError):
        import_file(session, 1, "x.ofx", b"lixo")
    session.rollback()
    assert session.scalar(select(func.count()).select_from(ImportBatch)) == 0


def test_undo_batch_removes_its_transactions(session):
    batch, _ = import_file(session, 1, "a.ofx", load("bradesco_conta.ofx"))
    session.commit()
    undo_batch(session, batch.id)
    session.commit()
    assert session.scalar(select(func.count()).select_from(Transaction)) == 0
    assert session.get(ImportBatch, batch.id) is None
```

Run: `.venv/bin/pytest tests/test_importer.py -v` — Expected: FAIL.

- [ ] **Step 2: Implementação**

`backend/app/services/__init__.py`: arquivo vazio.

`backend/app/services/importer.py`:
```python
from sqlalchemy import delete, select

from app.dedupe import make_hash
from app.models import ImportBatch, Transaction
from app.normalize import extract_installment, normalize_description
from app.parsers import parse_file

# Conservador de propósito: só o que é certamente dupla contagem.
# Transferências entre contas próprias não-óbvias são marcadas à mão na UI.
IGNORE_PATTERNS = (
    "PAGTO FATURA",
    "PGTO FATURA",
    "PAGAMENTO FATURA",
    "PAGAMENTO DE FATURA",
    "PAGTO CARTAO CREDITO",
    "TRANSFERENCIA ENTRE CONTAS",
)


def import_file(
    session, account_id: int, filename: str, content: bytes
) -> tuple[ImportBatch, list[Transaction]]:
    parsed = parse_file(filename, content)  # ValueError => nada foi escrito
    source = "csv" if filename.lower().endswith(".csv") else "ofx"
    batch = ImportBatch(source=source, filename=filename)
    session.add(batch)
    session.flush()

    new: list[Transaction] = []
    for p in parsed:
        h = make_hash(account_id, p.fitid, p.date, p.amount_cents, p.description)
        exists = session.scalar(select(Transaction.id).where(Transaction.dedupe_hash == h))
        if exists:
            batch.dup_count += 1
            continue
        norm = normalize_description(p.description)
        tx = Transaction(
            account_id=account_id,
            date=p.date,
            description=p.description,
            normalized=norm,
            amount_cents=p.amount_cents,
            dedupe_hash=h,
            batch_id=batch.id,
            installment=extract_installment(p.description),
            ignored=any(pat in norm for pat in IGNORE_PATTERNS),
        )
        session.add(tx)
        new.append(tx)
        batch.new_count += 1
    session.flush()
    return batch, new


def undo_batch(session, batch_id: int) -> None:
    session.execute(delete(Transaction).where(Transaction.batch_id == batch_id))
    batch = session.get(ImportBatch, batch_id)
    if batch:
        session.delete(batch)
```

- [ ] **Step 3: Verificar e commitar**

Run: `.venv/bin/pytest tests/test_importer.py -v` — Expected: 5 passed.

```bash
git add backend/app/services backend/tests/test_importer.py
git commit -m "feat(ingest): add atomic import service with dedupe, ignore flags and undo"
```

---

### Task 8: Classificador por regras + correção que vira regra

**Files:**
- Create: `backend/app/services/classifier.py`, `backend/tests/test_classifier_rules.py`

- [ ] **Step 1: Teste que falha**

`backend/tests/test_classifier_rules.py`:
```python
from datetime import date

from sqlalchemy import select

from app.models import Category, Rule, Transaction
from app.services.classifier import apply_correction, classify_new


def make_tx(session, desc, norm, cents=-1000):
    tx = Transaction(
        account_id=1, date=date(2026, 8, 1), description=desc, normalized=norm,
        amount_cents=cents, dedupe_hash=f"h-{norm}-{cents}",
    )
    session.add(tx)
    session.flush()
    return tx


def cat(session, name):
    return session.scalar(select(Category).where(Category.name == name))


def test_rule_classifies_without_llm(session):
    mercado = cat(session, "Mercado")
    session.add(Rule(matcher="SUPERMERCADO PAO DE ACUCAR", category_id=mercado.id))
    tx = make_tx(session, "SUPERMERCADO PAO DE ACUCAR 123", "SUPERMERCADO PAO DE ACUCAR")
    counts = classify_new(session, [tx], llm=None)
    assert tx.category_id == mercado.id and tx.source == "regra"
    assert counts == {"regra": 1, "llm": 0, "pendente": 0}


def test_unmatched_without_llm_stays_pending(session):
    tx = make_tx(session, "PIX QR CODE", "PIX QR CODE")
    counts = classify_new(session, [tx], llm=None)
    assert tx.category_id is None
    assert counts == {"regra": 0, "llm": 0, "pendente": 1}


def test_ignored_transactions_are_skipped(session):
    tx = make_tx(session, "PAGTO FATURA", "PAGTO FATURA")
    tx.ignored = True
    counts = classify_new(session, [tx], llm=None)
    assert counts == {"regra": 0, "llm": 0, "pendente": 0}


def test_correction_sets_manual_and_upserts_rule(session):
    lazer = cat(session, "Lazer")
    saude = cat(session, "Saúde")
    tx = make_tx(session, "DROGARIA XPTO", "DROGARIA XPTO")
    apply_correction(session, tx, lazer.id)
    assert tx.source == "manual" and tx.category_id == lazer.id
    apply_correction(session, tx, saude.id)  # segunda correção atualiza a regra
    rules = session.scalars(select(Rule).where(Rule.matcher == "DROGARIA XPTO")).all()
    assert len(rules) == 1 and rules[0].category_id == saude.id
```

Run: `.venv/bin/pytest tests/test_classifier_rules.py -v` — Expected: FAIL.

- [ ] **Step 2: Implementação**

`backend/app/services/classifier.py`:
```python
from sqlalchemy import select

from app.models import Category, Rule, Transaction

LLM_BATCH_SIZE = 50


def classify_new(session, txs: list[Transaction], llm) -> dict[str, int]:
    counts = {"regra": 0, "llm": 0, "pendente": 0}
    pending: list[Transaction] = []
    for tx in txs:
        if tx.ignored or tx.category_id is not None:
            continue
        rule = session.scalar(select(Rule).where(Rule.matcher == tx.normalized))
        if rule:
            tx.category_id, tx.source = rule.category_id, "regra"
            counts["regra"] += 1
        else:
            pending.append(tx)

    if pending and llm is not None:
        by_name = {
            c.name: c.id
            for c in session.scalars(select(Category).where(~Category.archived))
        }
        names = list(by_name)
        for i in range(0, len(pending), LLM_BATCH_SIZE):
            chunk = pending[i : i + LLM_BATCH_SIZE]
            items = [
                {"id": t.id, "descricao": t.description, "valor_centavos": t.amount_cents}
                for t in chunk
            ]
            result = llm.classify(items, names)  # dict[tx_id, nome_categoria]
            for t in chunk:
                name = result.get(t.id)
                if name in by_name:
                    t.category_id, t.source = by_name[name], "llm"
                    counts["llm"] += 1
                else:
                    counts["pendente"] += 1
    else:
        counts["pendente"] += len(pending)
    return counts


def apply_correction(session, tx: Transaction, category_id: int) -> None:
    tx.category_id, tx.source = category_id, "manual"
    if not tx.normalized:
        return
    rule = session.scalar(select(Rule).where(Rule.matcher == tx.normalized))
    if rule:
        rule.category_id = category_id
    else:
        session.add(Rule(matcher=tx.normalized, category_id=category_id))
```

- [ ] **Step 3: Verificar e commitar**

Run: `.venv/bin/pytest tests/test_classifier_rules.py -v` — Expected: 4 passed.

```bash
git add backend/app/services/classifier.py backend/tests/test_classifier_rules.py
git commit -m "feat(classify): add rule cascade and correction-to-rule learning"
```

---

### Task 9: Cliente LLM (Anthropic) com validação

**Files:**
- Create: `backend/app/services/llm.py`, `backend/tests/test_llm.py`

- [ ] **Step 1: Teste que falha**

`backend/tests/test_llm.py`:
```python
from datetime import date

from app.models import Transaction
from app.services.classifier import classify_new
from app.services.llm import build_prompt, parse_response


class FakeLLM:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def classify(self, items, categories):
        self.calls.append((items, categories))
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
```

Run: `.venv/bin/pytest tests/test_llm.py -v` — Expected: FAIL.

- [ ] **Step 2: Implementação**

`backend/app/services/llm.py`:
```python
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
```

- [ ] **Step 3: Verificar e commitar**

Run: `.venv/bin/pytest tests/test_llm.py -v` — Expected: 5 passed.

```bash
git add backend/app/services/llm.py backend/tests/test_llm.py
git commit -m "feat(classify): add Anthropic client with configurable model and strict validation"
```

---

### Task 10: Serviço de orçamento (vigência + resumo mensal)

**Files:**
- Create: `backend/app/services/budget.py`, `backend/tests/test_budget.py`

- [ ] **Step 1: Teste que falha**

`backend/tests/test_budget.py`:
```python
from datetime import date

from sqlalchemy import select

from app.models import Budget, Category, Transaction
from app.services.budget import budget_map, month_summary


def cat(session, name):
    return session.scalar(select(Category).where(Category.name == name))


def add_tx(session, cat_id, cents, d=date(2026, 8, 10), ignored=False):
    session.add(Transaction(
        account_id=1, date=d, description="X", normalized="X",
        amount_cents=cents, category_id=cat_id,
        dedupe_hash=f"h{cat_id}-{cents}-{d}", ignored=ignored,
    ))
    session.flush()


def test_budget_map_uses_latest_effective_value(session):
    mercado = cat(session, "Mercado")
    session.add_all([
        Budget(category_id=mercado.id, amount_cents=100000, valid_from="2026-01"),
        Budget(category_id=mercado.id, amount_cents=150000, valid_from="2026-06"),
    ])
    session.flush()
    assert budget_map(session, "2026-03")[mercado.id] == 100000
    assert budget_map(session, "2026-08")[mercado.id] == 150000
    assert budget_map(session, "2025-12") == {}


def test_month_summary_cash_flow(session):
    salario, mercado, invest = (
        cat(session, "Salário"), cat(session, "Mercado"), cat(session, "Investimentos")
    )
    session.add_all([
        Budget(category_id=salario.id, amount_cents=850000, valid_from="2026-01"),
        Budget(category_id=mercado.id, amount_cents=150000, valid_from="2026-01"),
        Budget(category_id=invest.id, amount_cents=200000, valid_from="2026-01"),
    ])
    add_tx(session, salario.id, 850000)
    add_tx(session, mercado.id, -124000)
    add_tx(session, invest.id, -200000)
    add_tx(session, mercado.id, -99900, ignored=True)  # não conta
    add_tx(session, mercado.id, -5000, d=date(2026, 7, 30))  # outro mês

    s = month_summary(session, "2026-08", today=date(2026, 8, 15))
    assert s["entradas"] == {"real": 850000, "orcado": 850000}
    assert s["saidas"] == {"real": 324000, "orcado": 350000}
    assert s["saldo"] == {"real": 526000, "orcado": 500000}
    # ritmo: (324000/350000) / (15/31)
    assert abs(s["ritmo"] - (324000 / 350000) / (15 / 31)) < 0.001
    linha_mercado = next(c for c in s["categorias"] if c["id"] == mercado.id)
    assert linha_mercado == {
        "id": mercado.id, "nome": "Mercado", "kind": "saida",
        "real": 124000, "orcado": 150000,
    }


def test_uncategorized_counts_by_sign(session):
    add_tx(session, None, -7000)
    s = month_summary(session, "2026-08", today=date(2026, 8, 15))
    assert s["saidas"]["real"] == 7000
    assert s["ritmo"] is None  # sem orçamento de saídas
```

Run: `.venv/bin/pytest tests/test_budget.py -v` — Expected: FAIL.

- [ ] **Step 2: Implementação**

`backend/app/services/budget.py`:
```python
import calendar
from collections import defaultdict
from datetime import date

from sqlalchemy import select

from app.models import Budget, Category, Transaction


def budget_map(session, month: str) -> dict[int, int]:
    rows = session.scalars(
        select(Budget).where(Budget.valid_from <= month).order_by(Budget.valid_from)
    )
    out: dict[int, int] = {}
    for b in rows:  # valid_from mais recente sobrescreve
        out[b.category_id] = b.amount_cents
    return out


def month_bounds(month: str) -> tuple[date, date]:
    year, m = int(month[:4]), int(month[5:7])
    last = calendar.monthrange(year, m)[1]
    return date(year, m, 1), date(year, m, last)


def real_by_category(session, start: date, end: date) -> dict[int | None, int]:
    txs = session.scalars(
        select(Transaction).where(
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.ignored.is_(False),
        )
    )
    out: dict[int | None, int] = defaultdict(int)
    for t in txs:
        out[t.category_id] += t.amount_cents
    return out


def month_summary(session, month: str, today: date | None = None) -> dict:
    start, end = month_bounds(month)
    today = today or date.today()
    cats = {c.id: c for c in session.scalars(select(Category))}
    bmap = budget_map(session, month)
    real = real_by_category(session, start, end)

    entradas_real = saidas_real = 0
    for cat_id, cents in real.items():
        kind = cats[cat_id].kind if cat_id is not None else (
            "entrada" if cents > 0 else "saida"
        )
        if kind == "entrada":
            entradas_real += cents
        else:
            saidas_real += -cents
    entradas_orc = sum(v for cid, v in bmap.items() if cats[cid].kind == "entrada")
    saidas_orc = sum(v for cid, v in bmap.items() if cats[cid].kind == "saida")

    if saidas_orc > 0:
        dia = today.day if start <= today <= end else end.day
        ritmo = (saidas_real / saidas_orc) / (dia / end.day)
    else:
        ritmo = None

    categorias = [
        {
            "id": c.id,
            "nome": c.name,
            "kind": c.kind,
            "real": abs(real.get(c.id, 0)),
            "orcado": bmap.get(c.id, 0),
        }
        for c in cats.values()
        if not c.archived and (c.id in real or c.id in bmap)
    ]
    return {
        "month": month,
        "entradas": {"real": entradas_real, "orcado": entradas_orc},
        "saidas": {"real": saidas_real, "orcado": saidas_orc},
        "saldo": {
            "real": entradas_real - saidas_real,
            "orcado": entradas_orc - saidas_orc,
        },
        "ritmo": ritmo,
        "categorias": sorted(categorias, key=lambda c: (c["kind"], -c["real"])),
    }
```

- [ ] **Step 3: Verificar e commitar**

Run: `.venv/bin/pytest tests/test_budget.py -v` — Expected: 3 passed.

```bash
git add backend/app/services/budget.py backend/tests/test_budget.py
git commit -m "feat(budget): add effective-dated budgets and monthly cash-flow summary"
```

---

### Task 11: Bridge orçado → realizado

**Files:**
- Create: `backend/app/services/bridge.py`, `backend/tests/test_bridge.py`

- [ ] **Step 1: Teste que falha**

`backend/tests/test_bridge.py`:
```python
from datetime import date

from sqlalchemy import select

from app.models import Budget, Category, Transaction
from app.services.bridge import bridge, months_for_period


def cat(session, name):
    return session.scalar(select(Category).where(Category.name == name))


def add_tx(session, cat_id, cents, d):
    session.add(Transaction(
        account_id=1, date=d, description="X", normalized="X",
        amount_cents=cents, category_id=cat_id,
        dedupe_hash=f"h{cat_id}-{cents}-{d}",
    ))
    session.flush()


def test_months_for_period():
    assert months_for_period("month", "2026-08") == ["2026-08"]
    assert months_for_period("ytd", "2026-03") == ["2026-01", "2026-02", "2026-03"]
    twelve = months_for_period("12m", "2026-08")
    assert twelve[0] == "2025-09" and twelve[-1] == "2026-08" and len(twelve) == 12


def test_bridge_single_month(session):
    salario, mercado = cat(session, "Salário"), cat(session, "Mercado")
    session.add_all([
        Budget(category_id=salario.id, amount_cents=850000, valid_from="2026-01"),
        Budget(category_id=mercado.id, amount_cents=150000, valid_from="2026-01"),
    ])
    add_tx(session, salario.id, 850000, date(2026, 8, 5))
    add_tx(session, mercado.id, -178000, date(2026, 8, 9))

    b = bridge(session, "month", "2026-08")
    assert b["start"] == 700000  # saldo orçado
    assert b["end"] == 672000  # saldo real
    step = next(s for s in b["steps"] if s["categoria"] == "Mercado")
    assert step["delta"] == -28000  # gastou 28000 a mais => piora o saldo
    assert b["start"] + sum(s["delta"] for s in b["steps"]) == b["end"]


def test_bridge_aggregates_small_deviations_into_demais(session):
    cats = [c for c in session.scalars(select(Category)) if c.kind == "saida"][:10]
    for i, c in enumerate(cats):
        add_tx(session, c.id, -(1000 + i), date(2026, 8, 5))
    b = bridge(session, "month", "2026-08")
    assert len(b["steps"]) <= 9  # top 8 + "Demais"
    assert any(s["categoria"] == "Demais" for s in b["steps"])
    assert b["start"] + sum(s["delta"] for s in b["steps"]) == b["end"]


def test_bridge_respects_budget_effective_dates_across_period(session):
    mercado = cat(session, "Mercado")
    session.add_all([
        Budget(category_id=mercado.id, amount_cents=100000, valid_from="2026-01"),
        Budget(category_id=mercado.id, amount_cents=200000, valid_from="2026-08"),
    ])
    b = bridge(session, "ytd", "2026-08")
    # 7 meses a 100000 + 1 mês a 200000, tudo saída
    assert b["start"] == -(7 * 100000 + 200000)
```

Run: `.venv/bin/pytest tests/test_bridge.py -v` — Expected: FAIL.

- [ ] **Step 2: Implementação**

`backend/app/services/bridge.py`:
```python
from collections import defaultdict

from sqlalchemy import select

from app.models import Category
from app.services.budget import budget_map, month_bounds, real_by_category

TOP_N = 8


def months_for_period(period: str, ref: str) -> list[str]:
    year, month = int(ref[:4]), int(ref[5:7])
    if period == "month":
        return [ref]
    if period == "ytd":
        return [f"{year:04d}-{m:02d}" for m in range(1, month + 1)]
    if period == "12m":
        out = []
        y, m = year, month
        for _ in range(12):
            out.append(f"{y:04d}-{m:02d}")
            m -= 1
            if m == 0:
                y, m = y - 1, 12
        return list(reversed(out))
    raise ValueError(f"Período inválido: {period}")


def bridge(session, period: str, ref: str) -> dict:
    months = months_for_period(period, ref)
    cats = {c.id: c for c in session.scalars(select(Category))}

    orc_signed: dict[int, int] = defaultdict(int)
    for month in months:
        for cat_id, cents in budget_map(session, month).items():
            sign = 1 if cats[cat_id].kind == "entrada" else -1
            orc_signed[cat_id] += sign * cents

    start = month_bounds(months[0])[0]
    end = month_bounds(months[-1])[1]
    real_signed = real_by_category(session, start, end)

    effects = []
    for cat_id in set(orc_signed) | set(real_signed):
        delta = real_signed.get(cat_id, 0) - orc_signed.get(cat_id, 0)
        if delta == 0:
            continue
        name = cats[cat_id].name if cat_id is not None else "Sem categoria"
        effects.append({"categoria": name, "delta": delta})
    effects.sort(key=lambda e: abs(e["delta"]), reverse=True)

    steps = effects[:TOP_N]
    rest = sum(e["delta"] for e in effects[TOP_N:])
    if rest != 0:
        steps.append({"categoria": "Demais", "delta": rest})

    total_orc = sum(orc_signed.values())
    return {
        "period": period,
        "ref": ref,
        "months": months,
        "start": total_orc,
        "steps": steps,
        "end": total_orc + sum(s["delta"] for s in steps),
    }
```

- [ ] **Step 3: Verificar e commitar**

Run: `.venv/bin/pytest tests/test_bridge.py -v` — Expected: 4 passed.

```bash
git add backend/app/services/bridge.py backend/tests/test_bridge.py
git commit -m "feat(budget): add budget-to-actual bridge with month/ytd/12m periods"
```

---

### Task 12: API — contas, categorias, regras, configurações

**Files:**
- Create: `backend/app/schemas.py`, `backend/app/routers/__init__.py`, `backend/app/routers/meta.py`, `backend/tests/test_api_meta.py`
- Modify: `backend/app/main.py`, `backend/tests/conftest.py`

- [ ] **Step 1: Fixture de client (modify `backend/tests/conftest.py`)** — adicionar ao final:

```python
from fastapi.testclient import TestClient

from app.db import get_session
from app.main import create_app


@pytest.fixture
def client(session):
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c
```

- [ ] **Step 2: Teste que falha**

`backend/tests/test_api_meta.py`:
```python
def test_list_accounts(client):
    r = client.get("/api/accounts")
    assert r.status_code == 200
    assert len(r.json()) == 4


def test_category_crud(client):
    r = client.post("/api/categories", json={"name": "Pets", "kind": "saida"})
    assert r.status_code == 201
    cat_id = r.json()["id"]
    r = client.patch(f"/api/categories/{cat_id}", json={"name": "Animais", "archived": True})
    assert r.status_code == 200
    listed = client.get("/api/categories").json()
    edited = next(c for c in listed if c["id"] == cat_id)
    assert edited["name"] == "Animais" and edited["archived"] is True


def test_duplicate_category_name_is_400(client):
    assert client.post("/api/categories", json={"name": "Mercado", "kind": "saida"}).status_code == 400


def test_settings_get_and_put(client):
    assert client.get("/api/settings").json()["llm_model"].startswith("claude-")
    r = client.put("/api/settings", json={"llm_model": "claude-sonnet-5"})
    assert r.status_code == 200
    assert client.get("/api/settings").json()["llm_model"] == "claude-sonnet-5"


def test_rules_list_and_delete(client, session):
    from app.models import Rule
    session.add(Rule(matcher="UBER", category_id=1))
    session.flush()
    rules = client.get("/api/rules").json()
    assert len(rules) == 1
    assert client.delete(f"/api/rules/{rules[0]['id']}").status_code == 204
    assert client.get("/api/rules").json() == []
```

Run: `.venv/bin/pytest tests/test_api_meta.py -v` — Expected: FAIL.

- [ ] **Step 3: Implementação**

`backend/app/schemas.py`:
```python
from typing import Optional

from pydantic import BaseModel


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
    amount_cents: int
    valid_from: str  # "YYYY-MM"
```

`backend/app/routers/__init__.py`: arquivo vazio.

`backend/app/routers/meta.py`:
```python
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
```

Modify `backend/app/main.py` (substituir o arquivo):
```python
from fastapi import FastAPI

from app.routers import meta


def create_app() -> FastAPI:
    app = FastAPI(title="Financas")
    app.include_router(meta.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 4: Verificar e commitar**

Run: `.venv/bin/pytest -v` — Expected: todos os testes anteriores + 5 novos passed.

```bash
git add backend/app backend/tests
git commit -m "feat(api): add accounts, categories, rules and settings endpoints"
```

---

### Task 13: API — transações e orçamento

**Files:**
- Create: `backend/app/routers/transactions.py`, `backend/app/routers/budgets.py`, `backend/tests/test_api_tx_budget.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Teste que falha**

`backend/tests/test_api_tx_budget.py`:
```python
from datetime import date

from sqlalchemy import select

from app.models import Category, Rule, Transaction


def seed_tx(session, **kw):
    defaults = dict(
        account_id=1, date=date(2026, 8, 5), description="UBER TRIP 99",
        normalized="UBER TRIP", amount_cents=-2350, dedupe_hash="h-uber",
    )
    defaults.update(kw)
    tx = Transaction(**defaults)
    session.add(tx)
    session.flush()
    return tx


def test_list_transactions_with_filters(client, session):
    seed_tx(session)
    seed_tx(session, date=date(2026, 7, 1), dedupe_hash="h2", description="MERCADO")
    r = client.get("/api/transactions", params={"month": "2026-08"})
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1 and body[0]["description"] == "UBER TRIP 99"
    r = client.get("/api/transactions", params={"q": "mercado"})
    assert len(r.json()) == 1


def test_patch_category_creates_rule(client, session):
    tx = seed_tx(session)
    transporte = session.scalar(select(Category).where(Category.name == "Transporte"))
    r = client.patch(f"/api/transactions/{tx.id}", json={"category_id": transporte.id})
    assert r.status_code == 200
    assert r.json()["source"] == "manual"
    rule = session.scalar(select(Rule).where(Rule.matcher == "UBER TRIP"))
    assert rule.category_id == transporte.id


def test_patch_ignored_toggle(client, session):
    tx = seed_tx(session)
    r = client.patch(f"/api/transactions/{tx.id}", json={"ignored": True})
    assert r.json()["ignored"] is True


def test_budget_put_and_month_view(client, session):
    mercado = session.scalar(select(Category).where(Category.name == "Mercado"))
    r = client.put("/api/budgets", json={
        "category_id": mercado.id, "amount_cents": 150000, "valid_from": "2026-01",
    })
    assert r.status_code == 200
    r = client.put("/api/budgets", json={  # atualizar mesma vigência não duplica
        "category_id": mercado.id, "amount_cents": 160000, "valid_from": "2026-01",
    })
    assert r.status_code == 200
    view = client.get("/api/budgets", params={"month": "2026-08"}).json()
    linha = next(b for b in view if b["category_id"] == mercado.id)
    assert linha["amount_cents"] == 160000


def test_invalid_month_format_is_400(client):
    assert client.get("/api/transactions", params={"month": "08/2026"}).status_code == 400
```

Run: `.venv/bin/pytest tests/test_api_tx_budget.py -v` — Expected: FAIL.

- [ ] **Step 2: Implementação**

`backend/app/routers/transactions.py`:
```python
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.db import get_session
from app.models import Transaction
from app.schemas import TxPatch
from app.services.budget import month_bounds
from app.services.classifier import apply_correction

router = APIRouter(prefix="/api/transactions")

MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


def tx_out(t: Transaction) -> dict:
    return {
        "id": t.id, "account_id": t.account_id, "date": t.date.isoformat(),
        "description": t.description, "amount_cents": t.amount_cents,
        "category_id": t.category_id, "source": t.source,
        "installment": t.installment, "ignored": t.ignored,
    }


@router.get("")
def list_transactions(
    month: Optional[str] = None,
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    q: Optional[str] = None,
    include_ignored: bool = True,
    session=Depends(get_session),
):
    stmt = select(Transaction).order_by(Transaction.date.desc(), Transaction.id.desc())
    if month:
        if not MONTH_RE.match(month):
            raise HTTPException(400, "month deve ser YYYY-MM")
        start, end = month_bounds(month)
        stmt = stmt.where(Transaction.date >= start, Transaction.date <= end)
    if account_id:
        stmt = stmt.where(Transaction.account_id == account_id)
    if category_id:
        stmt = stmt.where(Transaction.category_id == category_id)
    if q:
        stmt = stmt.where(Transaction.description.icontains(q))
    if not include_ignored:
        stmt = stmt.where(Transaction.ignored.is_(False))
    return [tx_out(t) for t in session.scalars(stmt)]


@router.patch("/{tx_id}")
def patch_transaction(tx_id: int, payload: TxPatch, session=Depends(get_session)):
    tx = session.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transação não encontrada")
    if payload.category_id is not None:
        apply_correction(session, tx, payload.category_id)
    if payload.ignored is not None:
        tx.ignored = payload.ignored
    session.commit()
    return tx_out(tx)
```

`backend/app/routers/budgets.py`:
```python
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.db import get_session
from app.models import Budget, Category
from app.schemas import BudgetPut
from app.services.budget import budget_map

router = APIRouter(prefix="/api/budgets")

MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


@router.get("")
def budgets_for_month(month: str, session=Depends(get_session)):
    if not MONTH_RE.match(month):
        raise HTTPException(400, "month deve ser YYYY-MM")
    bmap = budget_map(session, month)
    cats = {c.id: c for c in session.scalars(select(Category))}
    return [
        {
            "category_id": cid,
            "category_name": cats[cid].name,
            "kind": cats[cid].kind,
            "amount_cents": cents,
        }
        for cid, cents in bmap.items()
    ]


@router.put("")
def put_budget(payload: BudgetPut, session=Depends(get_session)):
    if not MONTH_RE.match(payload.valid_from):
        raise HTTPException(400, "valid_from deve ser YYYY-MM")
    if not session.get(Category, payload.category_id):
        raise HTTPException(404, "Categoria não encontrada")
    existing = session.scalar(
        select(Budget).where(
            Budget.category_id == payload.category_id,
            Budget.valid_from == payload.valid_from,
        )
    )
    if existing:
        existing.amount_cents = payload.amount_cents
    else:
        session.add(Budget(**payload.model_dump()))
    session.commit()
    return {"ok": True}
```

Modify `backend/app/main.py` — trocar imports e includes:
```python
from fastapi import FastAPI

from app.routers import budgets, meta, transactions


def create_app() -> FastAPI:
    app = FastAPI(title="Financas")
    app.include_router(meta.router)
    app.include_router(transactions.router)
    app.include_router(budgets.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 3: Verificar e commitar**

Run: `.venv/bin/pytest -v` — Expected: todos passed (5 novos).

```bash
git add backend/app backend/tests
git commit -m "feat(api): add transaction listing/correction and budget endpoints"
```

---

### Task 14: API — importação, classificação pendente e dashboard

**Files:**
- Create: `backend/app/routers/imports.py`, `backend/app/routers/dashboard.py`, `backend/tests/test_api_import_dashboard.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Teste que falha**

`backend/tests/test_api_import_dashboard.py`:
```python
from datetime import date
from pathlib import Path

from sqlalchemy import func, select

from app.models import Transaction

FIXTURES = Path(__file__).parent / "fixtures"


def upload(client, filename="bradesco_conta.ofx", account_id=1):
    return client.post(
        "/api/imports",
        data={"account_id": str(account_id)},
        files={"file": (filename, (FIXTURES / filename).read_bytes())},
    )


def test_import_endpoint_returns_summary(client):
    r = upload(client)
    assert r.status_code == 200
    body = r.json()
    assert body["new_count"] == 3 and body["dup_count"] == 0
    assert body["classified"] == {"regra": 0, "llm": 0, "pendente": 2}
    # 3 novas, 1 ignorada (pagto fatura) => 2 classificáveis pendentes (sem LLM)


def test_import_invalid_file_is_400_and_writes_nothing(client, session):
    r = client.post(
        "/api/imports",
        data={"account_id": "1"},
        files={"file": ("x.ofx", b"lixo")},
    )
    assert r.status_code == 400
    assert session.scalar(select(func.count()).select_from(Transaction)) == 0


def test_import_list_and_undo(client, session):
    batch_id = upload(client).json()["batch_id"]
    assert len(client.get("/api/imports").json()) == 1
    assert client.delete(f"/api/imports/{batch_id}").status_code == 204
    assert session.scalar(select(func.count()).select_from(Transaction)) == 0


def test_dashboard_summary_and_feed(client, session):
    upload(client)
    tx = session.scalar(select(Transaction).where(Transaction.amount_cents == -18740))
    tx.category_id, tx.source = 1, "llm"
    session.flush()
    summary = client.get("/api/dashboard/summary", params={"month": "2026-07"}).json()
    assert summary["entradas"]["real"] == 850000
    feed = client.get("/api/dashboard/feed").json()
    assert len(feed) == 1 and feed[0]["source"] == "llm"


def test_dashboard_bridge_endpoint(client):
    r = client.get("/api/dashboard/bridge", params={"period": "ytd", "ref": "2026-08"})
    assert r.status_code == 200
    assert r.json()["months"][0] == "2026-01"
    assert client.get(
        "/api/dashboard/bridge", params={"period": "errado", "ref": "2026-08"}
    ).status_code == 400


def test_classify_pending_endpoint_without_llm(client):
    upload(client)
    r = client.post("/api/classify/pending")
    assert r.status_code == 200
    assert r.json() == {"regra": 0, "llm": 0, "pendente": 2}
```

Run: `.venv/bin/pytest tests/test_api_import_dashboard.py -v` — Expected: FAIL.

- [ ] **Step 2: Implementação**

`backend/app/routers/imports.py`:
```python
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select

from app.db import get_session
from app.models import Account, ImportBatch, Transaction
from app.services.classifier import classify_new
from app.services.importer import import_file, undo_batch
from app.services.llm import get_llm

router = APIRouter(prefix="/api")


@router.post("/imports")
async def create_import(
    account_id: int = Form(...),
    file: UploadFile = File(...),
    session=Depends(get_session),
):
    if not session.get(Account, account_id):
        raise HTTPException(404, "Conta não encontrada")
    content = await file.read()
    try:
        batch, new = import_file(session, account_id, file.filename, content)
    except ValueError as e:
        session.rollback()
        raise HTTPException(400, str(e))
    counts = classify_new(session, new, get_llm(session))
    session.commit()
    return {
        "batch_id": batch.id,
        "filename": batch.filename,
        "new_count": batch.new_count,
        "dup_count": batch.dup_count,
        "classified": counts,
    }


@router.get("/imports")
def list_imports(session=Depends(get_session)):
    batches = session.scalars(select(ImportBatch).order_by(ImportBatch.id.desc()))
    return [
        {
            "id": b.id, "filename": b.filename, "source": b.source,
            "imported_at": b.imported_at.isoformat(),
            "new_count": b.new_count, "dup_count": b.dup_count,
        }
        for b in batches
    ]


@router.delete("/imports/{batch_id}", status_code=204)
def delete_import(batch_id: int, session=Depends(get_session)):
    if not session.get(ImportBatch, batch_id):
        raise HTTPException(404, "Lote não encontrado")
    undo_batch(session, batch_id)
    session.commit()


@router.post("/classify/pending")
def classify_pending(session=Depends(get_session)):
    pending = list(
        session.scalars(
            select(Transaction).where(
                Transaction.category_id.is_(None), Transaction.ignored.is_(False)
            )
        )
    )
    counts = classify_new(session, pending, get_llm(session))
    session.commit()
    return counts
```

`backend/app/routers/dashboard.py`:
```python
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.db import get_session
from app.models import Transaction
from app.routers.transactions import tx_out
from app.services.bridge import bridge as compute_bridge
from app.services.budget import month_summary

router = APIRouter(prefix="/api/dashboard")

MONTH_RE = re.compile(r"^\d{4}-\d{2}$")
FEED_LIMIT = 20


@router.get("/summary")
def summary(month: str, session=Depends(get_session)):
    if not MONTH_RE.match(month):
        raise HTTPException(400, "month deve ser YYYY-MM")
    return month_summary(session, month)


@router.get("/feed")
def llm_feed(session=Depends(get_session)):
    txs = session.scalars(
        select(Transaction)
        .where(Transaction.source == "llm")
        .order_by(Transaction.id.desc())
        .limit(FEED_LIMIT)
    )
    return [tx_out(t) for t in txs]


@router.get("/bridge")
def bridge(period: str, ref: str, session=Depends(get_session)):
    if not MONTH_RE.match(ref):
        raise HTTPException(400, "ref deve ser YYYY-MM")
    try:
        return compute_bridge(session, period, ref)
    except ValueError as e:
        raise HTTPException(400, str(e))
```

Modify `backend/app/main.py` — atualizar imports e includes:
```python
from fastapi import FastAPI

from app.routers import budgets, dashboard, imports, meta, transactions


def create_app() -> FastAPI:
    app = FastAPI(title="Financas")
    app.include_router(meta.router)
    app.include_router(transactions.router)
    app.include_router(budgets.router)
    app.include_router(imports.router)
    app.include_router(dashboard.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 3: Verificar e commitar**

Run: `.venv/bin/pytest -v` — Expected: todos passed (7 novos).

```bash
git add backend/app backend/tests
git commit -m "feat(api): add import upload/undo, pending reclassification and dashboard endpoints"
```

---

### Task 15: Wiring final — startup, estáticos e verificação

**Files:**
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_startup.py`

- [ ] **Step 1: Teste que falha**

`backend/tests/test_startup.py`:
```python
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db as db
from app.main import create_app


def test_app_starts_seeds_and_serves(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # troca engine/SessionLocal no módulo: init_db e get_session leem daqui
    monkeypatch.setattr(db, "engine", engine)
    monkeypatch.setattr(db, "SessionLocal", sessionmaker(bind=engine))
    with TestClient(create_app(init=True)) as client:
        assert client.get("/api/health").json() == {"status": "ok"}
        accounts = client.get("/api/accounts").json()
        assert len(accounts) == 4  # startup rodou init_db + seed
```

Run: `.venv/bin/pytest tests/test_startup.py -v` — Expected: FAIL (`create_app` não aceita `init`).

- [ ] **Step 2: Implementação final de `backend/app/main.py`**

```python
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.routers import budgets, dashboard, imports, meta, transactions

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def create_app(init: bool = False) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if init:
            from app.db import SessionLocal, init_db

            init_db()
            with SessionLocal() as session:
                from app.seed import seed

                seed(session)
                session.commit()
        yield

    app = FastAPI(title="Financas", lifespan=lifespan)
    app.include_router(meta.router)
    app.include_router(transactions.router)
    app.include_router(budgets.router)
    app.include_router(imports.router)
    app.include_router(dashboard.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    if FRONTEND_DIST.is_dir():  # o Plano 2 (frontend) cria este diretório
        app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="app")

    return app


app = create_app(init=True)
```

- [ ] **Step 3: Suite completa + smoke manual**

Run: `.venv/bin/pytest -v` — Expected: TODOS os testes passed.

Smoke manual:
```bash
cd /home/mathe/programming/financial-tracking-platform
cp backend/.env.example backend/.env   # preencher ANTHROPIC_API_KEY se quiser LLM
./run.sh &
sleep 2
curl -s localhost:8000/api/health      # {"status":"ok"}
curl -s localhost:8000/api/accounts    # 4 contas
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add backend
git commit -m "feat(app): wire startup seed and static frontend mount"
```

- [ ] **Step 5: Encerrar branch**

Usar a skill superpowers:finishing-a-development-branch para decidir merge em `main`. Depois do merge, escrever o **Plano 2 (frontend React)** com a API real como referência.
