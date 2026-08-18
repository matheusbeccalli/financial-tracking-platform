# Tela de Parcelamentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela `/parcelamentos` que projeta mês a mês as parcelas de cartão já contratadas (lidas do mês de referência) e cruza com o orçamento por categoria (status ok/risco/estouro).

**Architecture:** Colunas estruturadas `installment_number`/`installment_total` em `Transaction`, preenchidas pela regex existente e pelo `creditCardMetadata` da Pluggy; endpoint `GET /api/installments/projection?month=` devolve a matriz pronta; página React só renderiza. Spec: `docs/superpowers/specs/2026-08-18-parcelamentos-design.md`.

**Tech Stack:** FastAPI + SQLAlchemy 2 + SQLite (pytest), React 19 + react-query + CSS próprio (vitest só para lib pura).

**Comandos base:**
- Backend: `cd backend && .venv/bin/python -m pytest tests/ -q` (um arquivo: `.venv/bin/python -m pytest tests/test_x.py -v`)
- Frontend: `cd frontend && npm test` | `npm run build`

---

### Task 1: `parse_installment` em normalize.py

Converte a string `"N/T"` em inteiros validados — usada pelo importer e pelo backfill da migração.

**Files:**
- Modify: `backend/app/normalize.py`
- Test: `backend/tests/test_normalize.py`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `backend/tests/test_normalize.py`:

```python
from app.normalize import parse_installment


def test_parse_installment_valido():
    assert parse_installment("02/10") == (2, 10)
    assert parse_installment("3/6") == (3, 6)
    assert parse_installment(" 03 / 06 ") == (3, 6)


def test_parse_installment_invalido():
    assert parse_installment(None) is None
    assert parse_installment("") is None
    assert parse_installment("garbage") is None
    assert parse_installment("00/10") is None  # parcela 0 não existe
    assert parse_installment("5/1") is None    # atual > total
    assert parse_installment("1/1") is None    # total < 2 não é parcelamento
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_normalize.py -v`
Expected: FAIL — `ImportError: cannot import name 'parse_installment'`

- [ ] **Step 3: Implementar**

Acrescentar ao final de `backend/app/normalize.py`:

```python
def parse_installment(inst: str | None) -> tuple[int, int] | None:
    """"02/10" → (2, 10). None, formato ou faixa inválidos → None.

    Mesma regra de validade do extract_installment (1 <= atual <= total, total >= 2);
    revalida porque a migração faz backfill de strings gravadas antes da regra existir.
    """
    if not inst:
        return None
    m = re.fullmatch(r"(\d{1,2})\s*/\s*(\d{1,2})", inst.strip())
    if not m:
        return None
    cur, total = int(m.group(1)), int(m.group(2))
    if 1 <= cur <= total and total >= 2:
        return (cur, total)
    return None
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_normalize.py -v`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add backend/app/normalize.py backend/tests/test_normalize.py
git commit -m "feat(parcelamentos): parse_installment converte string N/T em inteiros"
```

---

### Task 2: Colunas no modelo + `ParsedTransaction` + importer

**Files:**
- Modify: `backend/app/models.py:53` (classe `Transaction`)
- Modify: `backend/app/parsers/__init__.py:5-9` (dataclass `ParsedTransaction`)
- Modify: `backend/app/services/importer.py` (import e `import_parsed`)
- Test: `backend/tests/test_importer.py`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `backend/tests/test_importer.py` (o arquivo já importa ou tem acesso a `import_parsed`; adicionar imports que faltarem no topo):

```python
from datetime import date

from app.parsers import ParsedTransaction
from app.services.importer import import_parsed


def test_import_preenche_parcela_via_regex(session):
    parsed = [
        ParsedTransaction(date=date(2026, 7, 5), description="LOJA X PARC 02/10", amount_cents=-4500)
    ]
    _, new = import_parsed(session, 2, "f.csv", "csv", parsed)
    assert new[0].installment == "02/10"
    assert (new[0].installment_number, new[0].installment_total) == (2, 10)


def test_import_usa_campos_estruturados_do_parsed():
    """Campos vindos do conector (Pluggy) ganham da regex e derivam a string NN/TT."""
    p = ParsedTransaction(
        date=date(2026, 7, 5), description="LOJA Y", amount_cents=-4500,
        installment_number=3, installment_total=6,
    )
    assert (p.installment_number, p.installment_total) == (3, 6)


def test_import_grava_campos_estruturados(session):
    parsed = [
        ParsedTransaction(
            date=date(2026, 7, 6), description="LOJA Y", amount_cents=-4500,
            installment_number=3, installment_total=6,
        )
    ]
    _, new = import_parsed(session, 2, "pluggy", "pluggy", parsed)
    assert new[0].installment == "03/06"
    assert (new[0].installment_number, new[0].installment_total) == (3, 6)


def test_import_sem_parcela_fica_none(session):
    parsed = [ParsedTransaction(date=date(2026, 7, 7), description="PADARIA", amount_cents=-1000)]
    _, new = import_parsed(session, 2, "f.csv", "csv", parsed)
    assert new[0].installment is None
    assert new[0].installment_number is None
    assert new[0].installment_total is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_importer.py -v`
Expected: FAIL — `TypeError: ... unexpected keyword argument 'installment_number'`

- [ ] **Step 3: Implementar**

Em `backend/app/models.py`, na classe `Transaction`, logo após a linha `installment: Mapped[Optional[str]]  # ex.: "02/10"`:

```python
    installment_number: Mapped[Optional[int]]  # nº da parcela (1-based)
    installment_total: Mapped[Optional[int]]  # total de parcelas
```

Em `backend/app/parsers/__init__.py`, a dataclass vira:

```python
@dataclass(frozen=True)
class ParsedTransaction:
    date: date
    description: str
    amount_cents: int
    # Preenchidos por conectores que trazem parcela estruturada (Pluggy);
    # parsers de arquivo deixam None e o importer cai na regex da descrição.
    installment_number: int | None = None
    installment_total: int | None = None
```

Em `backend/app/services/importer.py`, trocar o import de normalize:

```python
from app.normalize import extract_installment, normalize_description, parse_installment
```

E dentro de `import_parsed`, substituir o bloco que cria a `Transaction` (a partir de `norm = normalize_description(p.description)`) por:

```python
        norm = normalize_description(p.description)
        num, tot = p.installment_number, p.installment_total
        if num is not None and tot is not None:
            inst = f"{num:02d}/{tot:02d}"  # badge da UI usa a string
        else:
            inst = extract_installment(p.description)
            num, tot = parse_installment(inst) or (None, None)
        tx = Transaction(
            account_id=account_id,
            date=p.date,
            description=p.description,
            normalized=norm,
            amount_cents=p.amount_cents,
            dedupe_hash=h,
            batch_id=batch.id,
            installment=inst,
            installment_number=num,
            installment_total=tot,
            ignored=any(pat in norm for pat in IGNORE_PATTERNS)
            or norm in ignore_matchers,
        )
```

- [ ] **Step 4: Rodar a suíte inteira do backend**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: PASS (nada além do importer deveria quebrar; `create_all` dos testes já cria as colunas novas)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/parsers/__init__.py backend/app/services/importer.py backend/tests/test_importer.py
git commit -m "feat(parcelamentos): colunas installment_number/total preenchidas no import"
```

---

### Task 3: Migração one-off do banco real

O `create_all` não altera tabela existente; sem isto o app real quebra ao consultar as colunas novas.

**Files:**
- Create: `scripts/migrate_installment_fields.py`

- [ ] **Step 1: Escrever o script**

```python
"""Migração one-off (2026-08-18): colunas installment_number/installment_total.

Tela de Parcelamentos precisa de parcela estruturada. Este script:

1. faz backup do banco;
2. adiciona as colunas (se ainda não existem);
3. backfill: parseia as strings `installment` existentes com parse_installment
   (mesma regra de validade do importador); string inválida fica NULL.

Uso: backend/.venv/bin/python scripts/migrate_installment_fields.py
"""

import argparse
import shutil
import sqlite3
import sys
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from app.normalize import parse_installment  # noqa: E402

DB = BACKEND / "financas.db"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backup-suffix", default=date.today().strftime("%Y%m%d"))
    args = ap.parse_args()

    backup = BACKEND / f"financas-backup-{args.backup_suffix}.db"
    if backup.exists():
        sys.exit(f"backup {backup.name} já existe; remova ou use --backup-suffix")
    shutil.copy2(DB, backup)
    print(f"backup: {backup.name}")

    con = sqlite3.connect(DB)
    try:
        cols = {r[1] for r in con.execute("PRAGMA table_info(transactions)")}
        for col in ("installment_number", "installment_total"):
            if col not in cols:
                con.execute(f"ALTER TABLE transactions ADD COLUMN {col} INTEGER")
        rows = con.execute(
            "SELECT id, installment FROM transactions WHERE installment IS NOT NULL"
        ).fetchall()
        updates = []
        for tx_id, inst in rows:
            parts = parse_installment(inst)
            if parts:
                updates.append((parts[0], parts[1], tx_id))
        con.executemany(
            "UPDATE transactions SET installment_number=?, installment_total=? WHERE id=?",
            updates,
        )
        con.commit()
        print(f"{len(rows)} strings de parcela, {len(updates)} com backfill")
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Executar contra o banco real**

Run: `backend/.venv/bin/python scripts/migrate_installment_fields.py`
Expected: imprime o nome do backup e algo como `243 strings de parcela, 243 com backfill` (número exato pode variar; strings malformadas ficam de fora)

- [ ] **Step 3: Verificar**

Run: `sqlite3 backend/financas.db "SELECT COUNT(*) FROM transactions WHERE installment_number IS NOT NULL"`
Expected: mesmo número de backfill impresso no passo anterior

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate_installment_fields.py
git commit -m "feat(parcelamentos): migracao one-off com backfill das colunas de parcela"
```

(O `financas.db` e o backup não são commitados.)

---

### Task 4: Pluggy `to_parsed` lê `creditCardMetadata`

**Files:**
- Modify: `backend/app/services/pluggy_sync.py` (`to_parsed` + helper)
- Test: `backend/tests/test_pluggy_sync.py`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `backend/tests/test_pluggy_sync.py` (reusar o estilo de payload dos testes existentes do arquivo; base mínima abaixo):

```python
def _raw(**extra):
    base = {
        "date": "2026-07-10T00:00:00Z",
        "description": "d",
        "descriptionRaw": "LOJA Z",
        "amount": 45.0,
        "status": "POSTED",
        "currencyCode": "BRL",
    }
    base.update(extra)
    return base


def test_to_parsed_le_credit_card_metadata():
    raw = [_raw(creditCardMetadata={"installmentNumber": 3, "totalInstallments": 10})]
    parsed, _ = to_parsed(raw, "CREDIT")
    assert (parsed[0].installment_number, parsed[0].installment_total) == (3, 10)


def test_to_parsed_sem_metadata_fica_none():
    parsed, _ = to_parsed([_raw()], "CREDIT")
    assert parsed[0].installment_number is None
    assert parsed[0].installment_total is None


def test_to_parsed_metadata_malformada_nao_quebra():
    casos = [
        _raw(creditCardMetadata=None),
        _raw(creditCardMetadata="oi"),
        _raw(creditCardMetadata={}),
        _raw(creditCardMetadata={"installmentNumber": "x", "totalInstallments": 10}),
        _raw(creditCardMetadata={"installmentNumber": 0, "totalInstallments": 10}),
        _raw(creditCardMetadata={"installmentNumber": 5, "totalInstallments": 1}),
    ]
    parsed, _ = to_parsed(casos, "CREDIT")
    assert all(p.installment_number is None and p.installment_total is None for p in parsed)
```

(`to_parsed` já é importado no topo do arquivo pelos testes existentes; se não for, adicionar `from app.services.pluggy_sync import to_parsed`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_pluggy_sync.py -v`
Expected: FAIL nos três testes novos (campos ficam None ou AttributeError)

- [ ] **Step 3: Implementar**

Em `backend/app/services/pluggy_sync.py`, adicionar antes de `to_parsed`:

```python
def _installment_from_meta(t: dict) -> tuple[int | None, int | None]:
    """creditCardMetadata → (numero, total). Ausente/malformado/inválido → (None, None)."""
    meta = t.get("creditCardMetadata")
    if not isinstance(meta, dict):
        return None, None
    num, tot = meta.get("installmentNumber"), meta.get("totalInstallments")
    if type(num) is not int or type(tot) is not int:
        return None, None
    if 1 <= num <= tot and tot >= 2:
        return num, tot
    return None, None
```

E em `to_parsed`, trocar a construção do `ParsedTransaction` por:

```python
        num, tot = _installment_from_meta(t)
        parsed.append(
            ParsedTransaction(
                date=date.fromisoformat(t["date"][:10]),
                description=t.get("descriptionRaw") or t["description"],
                amount_cents=cents,
                installment_number=num,
                installment_total=tot,
            )
        )
```

Atualizar também a docstring de `to_parsed` acrescentando a linha:
`- creditCardMetadata (installmentNumber/totalInstallments) vira parcela estruturada.`

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_pluggy_sync.py -v`
Expected: PASS (todos, incluindo os antigos)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/pluggy_sync.py backend/tests/test_pluggy_sync.py
git commit -m "feat(parcelamentos): sync pluggy persiste parcela do creditCardMetadata"
```

---

### Task 5: Serviço de projeção

**Files:**
- Create: `backend/app/services/installments.py`
- Test: `backend/tests/test_installments.py`

- [ ] **Step 1: Escrever os testes que falham**

Criar `backend/tests/test_installments.py`:

```python
from datetime import date

from sqlalchemy import select

from app.models import Account, Budget, Category, Transaction
from app.services.installments import _status, add_months, installments_projection

REF = "2026-07"


def cartao_id(session) -> int:
    return session.scalar(select(Account.id).where(Account.kind == "cartao"))


def corrente_id(session) -> int:
    return session.scalar(select(Account.id).where(Account.kind == "corrente"))


def cat_id(session, name: str) -> int:
    return session.scalar(select(Category.id).where(Category.name == name))


_seq = 0


def add_tx(session, account_id, desc, cents, num=None, tot=None, cat=None,
           ignored=False, d=date(2026, 7, 15)):
    global _seq
    _seq += 1
    tx = Transaction(
        account_id=account_id, date=d, description=desc, normalized=desc.upper(),
        amount_cents=cents, category_id=cat, dedupe_hash=f"h{_seq}",
        installment=f"{num:02d}/{tot:02d}" if num else None,
        installment_number=num, installment_total=tot, ignored=ignored,
    )
    session.add(tx)
    session.flush()
    return tx


def test_add_months():
    assert add_months("2026-07", 1) == "2026-08"
    assert add_months("2026-12", 1) == "2027-01"
    assert add_months("2026-07", 7) == "2027-02"


def test_status_limiares():
    assert _status(0, 0) == "ok"          # célula vazia nunca alerta
    assert _status(100, None) == "ok"     # sem orçamento no mês
    assert _status(39999, 50000) == "ok"
    assert _status(40000, 50000) == "risco"    # exatamente 80%
    assert _status(50000, 50000) == "risco"    # igual ao orçado ainda cabe
    assert _status(50001, 50000) == "estouro"


def test_projeta_serie_basica(session):
    mercado = cat_id(session, "Mercado")
    add_tx(session, cartao_id(session), "MAGALU 03/10", -45000, num=3, tot=10, cat=mercado)
    out = installments_projection(session, REF)
    assert out["months"] == [add_months(REF, i) for i in range(1, 8)]  # 7 restantes
    linha = out["categorias"][0]
    assert linha["nome"] == "Mercado"
    assert linha["parcelas"] == [45000] * 7
    assert out["totais"] == [45000] * 7
    s = out["series"][0]
    assert (s["numero"], s["total"], s["valor"]) == (3, 10, 45000)
    assert s["termina_em"] == "2027-02"
    assert s["restante"] == 45000 * 7


def test_ultima_parcela_aparece_mas_nao_projeta(session):
    add_tx(session, cartao_id(session), "LOJA 10/10", -10000, num=10, tot=10)
    out = installments_projection(session, REF)
    assert out["months"] == []
    assert out["categorias"] == []
    assert out["series"][0]["restante"] == 0
    assert out["series"][0]["termina_em"] == REF


def test_filtros(session):
    # conta corrente (falso positivo de Pix), ignorada e estorno positivo ficam fora
    add_tx(session, corrente_id(session), "PIX ATS PNEUS 02/07", -5000, num=2, tot=7)
    add_tx(session, cartao_id(session), "IGNORADA 02/05", -5000, num=2, tot=5, ignored=True)
    add_tx(session, cartao_id(session), "ESTORNO 02/05", 5000, num=2, tot=5)
    out = installments_projection(session, REF)
    assert out["series"] == []
    assert out["months"] == []


def test_orcamento_vigencia_e_status(session):
    mercado = cat_id(session, "Mercado")
    session.add(Budget(category_id=mercado, amount_cents=100000, valid_from="2026-01"))
    session.add(Budget(category_id=mercado, amount_cents=40000, valid_from="2026-10"))
    add_tx(session, cartao_id(session), "SOFA 01/06", -45000, num=1, tot=6, cat=mercado)
    out = installments_projection(session, REF)
    linha = out["categorias"][0]
    assert out["months"] == ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]
    assert linha["orcado"] == [100000, 100000, 40000, 40000, 40000]
    assert linha["status"] == ["ok", "ok", "estouro", "estouro", "estouro"]


def test_sem_categoria(session):
    session.add(Budget(category_id=cat_id(session, "Mercado"), amount_cents=100, valid_from="2026-01"))
    add_tx(session, cartao_id(session), "AVULSA 01/03", -30000, num=1, tot=3, cat=None)
    out = installments_projection(session, REF)
    linha = out["categorias"][0]
    assert linha["id"] is None
    assert linha["nome"] == "Sem categoria"
    assert linha["orcado"] == [None, None]
    assert linha["status"] == ["ok", "ok"]


def test_agrega_duas_series_na_mesma_categoria(session):
    mercado = cat_id(session, "Mercado")
    # A: restam 2 parcelas (ago, set), restante 20000; B: resta 1 (ago), restante 25000
    add_tx(session, cartao_id(session), "A 01/03", -10000, num=1, tot=3, cat=mercado)
    add_tx(session, cartao_id(session), "B 02/03", -25000, num=2, tot=3, cat=mercado)
    out = installments_projection(session, REF)
    linha = out["categorias"][0]
    assert out["months"] == ["2026-08", "2026-09"]
    assert linha["parcelas"] == [35000, 10000]
    assert out["totais"] == [35000, 10000]
    # série de maior restante primeiro
    assert out["series"][0]["descricao"] == "B 02/03"


def test_mes_sem_parcelas(session):
    out = installments_projection(session, REF)
    assert out == {"month": REF, "months": [], "categorias": [], "totais": [], "series": []}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_installments.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.installments'`

- [ ] **Step 3: Implementar**

Criar `backend/app/services/installments.py`:

```python
"""Projeção de parcelamentos de cartão (spec 2026-08-18).

Cada transação parcelada do mês de referência é uma série ativa: toda série
tem exatamente uma parcela por fatura mensal, então um único mês fechado
captura todas. Restam (total − numero) parcelas, uma por mês, mesmo valor.
"""
from sqlalchemy import select

from app.models import Account, Category, Transaction
from app.normalize import name_sort_key
from app.services.budget import budget_map, month_bounds

# risco quando parcelas >= 80% do orçado (inteiros: parcelas*5 >= orcado*4)
RISK_NUM, RISK_DEN = 4, 5


def add_months(month: str, delta: int) -> str:
    y, m = int(month[:4]), int(month[5:7])
    total = y * 12 + (m - 1) + delta
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def _status(parcelas: int, orcado: int | None) -> str:
    if parcelas == 0 or orcado is None:
        return "ok"
    if parcelas > orcado:
        return "estouro"
    if parcelas * RISK_DEN >= orcado * RISK_NUM:
        return "risco"
    return "ok"


def installments_projection(session, month: str) -> dict:
    start, end = month_bounds(month)
    txs = list(
        session.scalars(
            select(Transaction)
            .join(Account, Transaction.account_id == Account.id)
            .where(
                Account.kind == "cartao",
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.ignored.is_(False),
                Transaction.installment_number.is_not(None),
                Transaction.installment_total.is_not(None),
                Transaction.amount_cents < 0,
            )
            .order_by(Transaction.date, Transaction.id)
        )
    )
    accounts = {a.id: a.name for a in session.scalars(select(Account))}
    cats = {c.id: c for c in session.scalars(select(Category))}

    horizon = max((t.installment_total - t.installment_number for t in txs), default=0)
    months = [add_months(month, i) for i in range(1, horizon + 1)]
    bmaps = [budget_map(session, m) for m in months]

    series: list[dict] = []
    by_cat: dict[int | None, list[int]] = {}
    for t in txs:
        remaining = t.installment_total - t.installment_number
        valor = -t.amount_cents
        series.append({
            "tx_id": t.id,
            "descricao": t.description,
            "conta": accounts[t.account_id],
            "categoria_id": t.category_id,
            "categoria_nome": cats[t.category_id].name if t.category_id else None,
            "numero": t.installment_number,
            "total": t.installment_total,
            "valor": valor,
            "termina_em": add_months(month, remaining),
            "restante": valor * remaining,
        })
        if remaining:
            row = by_cat.setdefault(t.category_id, [0] * horizon)
            for i in range(remaining):
                row[i] += valor

    def cat_key(cid: int | None):
        return (cid is None, name_sort_key(cats[cid].name) if cid is not None else "")

    categorias = []
    for cid in sorted(by_cat, key=cat_key):
        parcelas = by_cat[cid]
        orcado = [bmaps[i].get(cid) if cid is not None else None for i in range(horizon)]
        categorias.append({
            "id": cid,
            "nome": cats[cid].name if cid is not None else "Sem categoria",
            "parcelas": parcelas,
            "orcado": orcado,
            "status": [_status(parcelas[i], orcado[i]) for i in range(horizon)],
        })

    totais = [sum(c["parcelas"][i] for c in categorias) for i in range(horizon)]
    series.sort(key=lambda s: -s["restante"])
    return {
        "month": month,
        "months": months,
        "categorias": categorias,
        "totais": totais,
        "series": series,
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_installments.py -v`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/installments.py backend/tests/test_installments.py
git commit -m "feat(parcelamentos): servico de projecao com status de orcamento"
```

---

### Task 6: Router `/api/installments` + registro

**Files:**
- Create: `backend/app/routers/installments.py`
- Modify: `backend/app/main.py:7,27-32`
- Test: `backend/tests/test_api_installments.py`

- [ ] **Step 1: Escrever os testes que falham**

Criar `backend/tests/test_api_installments.py`:

```python
from datetime import date

from sqlalchemy import select

from app.models import Account, Budget, Category, Transaction


def _add_tx(session, desc, cents, num, tot, cat=None):
    cartao = session.scalar(select(Account.id).where(Account.kind == "cartao"))
    session.add(Transaction(
        account_id=cartao, date=date(2026, 7, 15), description=desc,
        normalized=desc.upper(), amount_cents=cents, category_id=cat,
        dedupe_hash=f"api-{desc}", installment=f"{num:02d}/{tot:02d}",
        installment_number=num, installment_total=tot,
    ))
    session.commit()


def test_projection_mes_invalido(client):
    assert client.get("/api/installments/projection?month=2026-13").status_code == 400
    assert client.get("/api/installments/projection?month=x").status_code == 400


def test_projection_ok(client, session):
    mercado = session.scalar(select(Category.id).where(Category.name == "Mercado"))
    session.add(Budget(category_id=mercado, amount_cents=40000, valid_from="2026-01"))
    _add_tx(session, "MAGALU 03/10", -45000, 3, 10, cat=mercado)

    r = client.get("/api/installments/projection?month=2026-07")
    assert r.status_code == 200
    body = r.json()
    assert body["month"] == "2026-07"
    assert len(body["months"]) == 7
    assert body["categorias"][0]["status"] == ["estouro"] * 7
    assert body["series"][0]["conta"] == "Bradesco Cartão"


def test_projection_vazia(client):
    r = client.get("/api/installments/projection?month=2026-07")
    assert r.status_code == 200
    assert r.json()["series"] == []
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_api_installments.py -v`
Expected: FAIL — 404 nos GETs (rota não existe)

- [ ] **Step 3: Implementar**

Criar `backend/app/routers/installments.py`:

```python
from fastapi import APIRouter, Depends

from app.db import get_session
from app.routers.validators import require_month
from app.services.installments import installments_projection

router = APIRouter(prefix="/api/installments")


@router.get("/projection")
def projection(month: str, session=Depends(get_session)):
    require_month(month, "month")
    return installments_projection(session, month)
```

Em `backend/app/main.py`, trocar o import dos routers por:

```python
from app.routers import budgets, dashboard, imports, installments, meta, pluggy, transactions
```

E adicionar junto aos `include_router`:

```python
    app.include_router(installments.router)
```

- [ ] **Step 4: Rodar a suíte inteira do backend**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/installments.py backend/app/main.py backend/tests/test_api_installments.py
git commit -m "feat(parcelamentos): endpoint GET /api/installments/projection"
```

---

### Task 7: Frontend — types, hook e lib pura

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/hooks.ts`
- Create: `frontend/src/lib/installments.ts`
- Test: `frontend/src/lib/installments.test.ts`

- [ ] **Step 1: Tipos e hook**

Acrescentar ao final de `frontend/src/api/types.ts`:

```typescript
export type InstallmentStatus = "ok" | "risco" | "estouro";

export interface InstallmentCatRow {
  id: number | null;
  nome: string;
  parcelas: number[];
  orcado: (number | null)[];
  status: InstallmentStatus[];
}

export interface InstallmentSeries {
  tx_id: number;
  descricao: string;
  conta: string;
  categoria_id: number | null;
  categoria_nome: string | null;
  numero: number;
  total: number;
  valor: number;
  termina_em: string;
  restante: number;
}

export interface InstallmentsProjection {
  month: string;
  months: string[];
  categorias: InstallmentCatRow[];
  totais: number[];
  series: InstallmentSeries[];
}
```

Em `frontend/src/api/hooks.ts`, adicionar `InstallmentsProjection` ao import de types e, junto às queries:

```typescript
export const useInstallmentsProjection = (month: string) =>
  useQuery({
    queryKey: ["installments", month],
    queryFn: () =>
      api<InstallmentsProjection>(`/installments/projection?month=${month}`),
  });
```

- [ ] **Step 2: Escrever o teste da lib (falhando)**

Criar `frontend/src/lib/installments.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import type { InstallmentsProjection } from "../api/types";
import { installmentsKpis, monthStatuses } from "./installments";

const base: InstallmentsProjection = {
  month: "2026-07",
  months: ["2026-08", "2026-09", "2026-10"],
  categorias: [
    {
      id: 1,
      nome: "Mercado",
      parcelas: [45000, 45000, 45000],
      orcado: [40000, 60000, 50000],
      status: ["estouro", "ok", "risco"],
    },
    {
      id: null,
      nome: "Sem categoria",
      parcelas: [10000, 0, 0],
      orcado: [null, null, null],
      status: ["ok", "ok", "ok"],
    },
  ],
  totais: [55000, 45000, 45000],
  series: [
    { tx_id: 1, descricao: "A", conta: "c", categoria_id: 1, categoria_nome: "Mercado",
      numero: 3, total: 10, valor: 45000, termina_em: "2027-02", restante: 315000 },
    { tx_id: 2, descricao: "B", conta: "c", categoria_id: null, categoria_nome: null,
      numero: 2, total: 3, valor: 10000, termina_em: "2026-08", restante: 10000 },
  ],
};

describe("monthStatuses", () => {
  it("pega o pior status de cada coluna", () => {
    expect(monthStatuses(base)).toEqual(["estouro", "ok", "risco"]);
  });
});

describe("installmentsKpis", () => {
  it("soma restante, conta compras e meses alertados", () => {
    expect(installmentsKpis(base)).toEqual({
      restanteTotal: 325000,
      comprasAtivas: 2,
      mesesEstouro: 1,
      mesesRisco: 1,
    });
  });
  it("vazio zera tudo", () => {
    const vazio = { ...base, months: [], categorias: [], totais: [], series: [] };
    expect(installmentsKpis(vazio)).toEqual({
      restanteTotal: 0, comprasAtivas: 0, mesesEstouro: 0, mesesRisco: 0,
    });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd frontend && npm test`
Expected: FAIL — `Cannot find module './installments'`

- [ ] **Step 4: Implementar a lib**

Criar `frontend/src/lib/installments.ts`:

```typescript
import type { InstallmentStatus, InstallmentsProjection } from "../api/types";

export interface InstallmentsKpis {
  restanteTotal: number;
  comprasAtivas: number;
  mesesEstouro: number;
  mesesRisco: number;
}

/** Pior status de cada coluna da matriz: estouro > risco > ok. */
export function monthStatuses(p: InstallmentsProjection): InstallmentStatus[] {
  return p.months.map((_, i) => {
    const st = p.categorias.map((c) => c.status[i]);
    if (st.includes("estouro")) return "estouro";
    if (st.includes("risco")) return "risco";
    return "ok";
  });
}

export function installmentsKpis(p: InstallmentsProjection): InstallmentsKpis {
  const statuses = monthStatuses(p);
  return {
    restanteTotal: p.series.reduce((acc, s) => acc + s.restante, 0),
    comprasAtivas: p.series.length,
    mesesEstouro: statuses.filter((s) => s === "estouro").length,
    mesesRisco: statuses.filter((s) => s === "risco").length,
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd frontend && npm test`
Expected: PASS (suíte inteira)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/hooks.ts frontend/src/lib/installments.ts frontend/src/lib/installments.test.ts
git commit -m "feat(parcelamentos): types, hook e kpis puros no frontend"
```

---

### Task 8: Página, componentes, rota e CSS

Sem TDD aqui (convenção do projeto: componentes não têm teste de render); a verificação é `npm run build` + smoke manual.

**Files:**
- Create: `frontend/src/pages/Installments.tsx`
- Create: `frontend/src/components/installments/InstallmentsMatrix.tsx`
- Create: `frontend/src/components/installments/SeriesTable.tsx`
- Modify: `frontend/src/App.tsx` (rota)
- Modify: `frontend/src/components/Layout.tsx` (link + wide)
- Modify: `frontend/src/styles/pages.css` (bloco novo no final)

- [ ] **Step 1: Página**

Criar `frontend/src/pages/Installments.tsx`:

```tsx
import { useState } from "react";

import { useInstallmentsProjection } from "../api/hooks";
import Money from "../components/Money";
import MonthPicker from "../components/MonthPicker";
import PageHeader from "../components/PageHeader";
import InstallmentsMatrix from "../components/installments/InstallmentsMatrix";
import SeriesTable from "../components/installments/SeriesTable";
import { installmentsKpis } from "../lib/installments";
import { addMonths, currentMonth, monthName } from "../lib/months";

export default function Installments() {
  // último mês completo: a fatura do mês corrente ainda está aberta
  const [month, setMonth] = useState(() => addMonths(currentMonth(), -1));
  const { data, error, isLoading } = useInstallmentsProjection(month);

  const header = (
    <PageHeader
      eyebrow="Parcelamentos"
      title="Parcelas contratadas"
      subtitle={`Compras parceladas lidas da fatura de ${monthName(month)}, projetadas nos meses seguintes e comparadas ao orçamento vigente de cada categoria.`}
    >
      <MonthPicker month={month} onChange={setMonth} />
    </PageHeader>
  );

  if (error)
    return (
      <>
        {header}
        <p className="error">Erro ao carregar projeção: {(error as Error).message}</p>
      </>
    );
  if (isLoading || !data)
    return (
      <>
        {header}
        <p className="muted">Carregando…</p>
      </>
    );
  if (data.series.length === 0)
    return (
      <>
        {header}
        <div className="card muted">
          Nenhuma compra parcelada na fatura de {monthName(month)}. Faturas importadas e
          sincronizações da Pluggy alimentam esta tela automaticamente.
        </div>
      </>
    );

  const kpis = installmentsKpis(data);
  return (
    <>
      {header}
      <section className="kpi-strip">
        <div className="kpi">
          <div className="label">Restante contratado</div>
          <div className="kpi-value">
            <Money cents={kpis.restanteTotal} />
          </div>
          <div className="kpi-note">soma das parcelas ainda por pagar</div>
        </div>
        <div className="kpi">
          <div className="label">Compras ativas</div>
          <div className="kpi-value mono">{kpis.comprasAtivas}</div>
          <div className="kpi-note">parceladas na fatura de {monthName(month)}</div>
        </div>
        <div className="kpi">
          <div className="label">Meses com estouro</div>
          <div className="kpi-value mono">
            {kpis.mesesEstouro > 0 ? (
              <span className="tone-over">{kpis.mesesEstouro}</span>
            ) : (
              kpis.mesesEstouro
            )}
          </div>
          <div className="kpi-note">parcelas acima do orçamento da categoria</div>
        </div>
        <div className="kpi">
          <div className="label">Meses em risco</div>
          <div className="kpi-value mono">
            {kpis.mesesRisco > 0 ? (
              <span className="tone-warn">{kpis.mesesRisco}</span>
            ) : (
              kpis.mesesRisco
            )}
          </div>
          <div className="kpi-note">parcelas tomam ≥ 80% do orçamento</div>
        </div>
      </section>
      {data.months.length > 0 && <InstallmentsMatrix p={data} />}
      <SeriesTable series={data.series} />
    </>
  );
}
```

- [ ] **Step 2: Matriz**

Criar `frontend/src/components/installments/InstallmentsMatrix.tsx`:

```tsx
import { Fragment } from "react";

import type { InstallmentCatRow, InstallmentStatus, InstallmentsProjection } from "../../api/types";
import { formatUnits } from "../../lib/money";
import { monthLabel } from "../../lib/months";

const STATUS_CLS: Record<InstallmentStatus, string | undefined> = {
  ok: undefined,
  risco: "tone-warn",
  estouro: "tone-over",
};

export default function InstallmentsMatrix({ p }: { p: InstallmentsProjection }) {
  const cols = {
    gridTemplateColumns: `220px repeat(${p.months.length}, minmax(84px, 1fr))`,
  };
  return (
    <section className="card inst-card">
      <div className="inst-scroll">
        <div className="inst-grid" style={cols}>
          <div className="inst-head inst-cell-cat">Categoria</div>
          {p.months.map((m) => (
            <div key={m} className="num inst-head">
              {monthLabel(m)}
            </div>
          ))}

          {p.categorias.map((c) => (
            <Fragment key={c.id ?? "sem"}>
              <div className="inst-cell-cat" title={c.nome}>
                {c.nome}
              </div>
              {c.parcelas.map((v, i) => (
                <Cell key={p.months[i]} row={c} i={i} v={v} />
              ))}
            </Fragment>
          ))}

          <div className="inst-cell-cat inst-total">Total</div>
          {p.totais.map((v, i) => (
            <div key={p.months[i]} className="num inst-total">
              {formatUnits(v)}
            </div>
          ))}
        </div>
      </div>
      <div className="inst-legend">
        <span>
          <span className="tone-warn">risco</span> = parcelas tomam ≥ 80% do orçamento do mês ·{" "}
          <span className="tone-over">estouro</span> = parcelas acima do orçamento
        </span>
        <span>valores em unidades, sem centavos; orçamento mostrado na célula alertada</span>
      </div>
    </section>
  );
}

function Cell({ row, i, v }: { row: InstallmentCatRow; i: number; v: number }) {
  if (v === 0)
    return (
      <div className="num">
        <span className="inst-zero">—</span>
      </div>
    );
  const status = row.status[i];
  const cls = STATUS_CLS[status];
  const orcado = row.orcado[i];
  return (
    <div className="num">
      {cls ? <span className={cls}>{formatUnits(v)}</span> : formatUnits(v)}
      {cls && orcado !== null && (
        <span className="inst-orc">/ orç. {formatUnits(orcado)}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Lista de compras**

Criar `frontend/src/components/installments/SeriesTable.tsx`:

```tsx
import type { InstallmentSeries } from "../../api/types";
import Money from "../Money";
import { monthLabel } from "../../lib/months";

export default function SeriesTable({ series }: { series: InstallmentSeries[] }) {
  return (
    <section className="card">
      <h2 className="card-title">Compras parceladas ativas</h2>
      <div className="inst-scroll">
        <table className="inst-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Conta</th>
              <th>Categoria</th>
              <th className="num">Parcela</th>
              <th className="num">Valor mensal</th>
              <th className="num">Término</th>
              <th className="num">Restante</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.tx_id}>
                <td title={s.descricao}>{s.descricao}</td>
                <td className="muted">{s.conta}</td>
                <td className="muted">{s.categoria_nome ?? "Sem categoria"}</td>
                <td className="num">
                  <span className="tx-parcela mono">
                    {s.numero}/{s.total}
                  </span>
                </td>
                <td className="num">
                  <Money cents={s.valor} />
                </td>
                <td className="num mono">{monthLabel(s.termina_em)}</td>
                <td className="num">
                  <Money cents={s.restante} zeroDash />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

(Se `card-title` não existir em `components.css`, usar o padrão de título de card que as outras telas usam — conferir `Budget.tsx`/`Dashboard.tsx` e imitar.)

- [ ] **Step 4: Rota, link e wide**

Em `frontend/src/App.tsx`: importar `Installments from "./pages/Installments"` e adicionar entre orçamento e tendências:

```tsx
            <Route path="/parcelamentos" element={<Installments />} />
```

Em `frontend/src/components/Layout.tsx`:

```tsx
const LINKS = [
  ["/", "Dashboard"],
  ["/transacoes", "Transações"],
  ["/orcamento", "Orçamento"],
  ["/parcelamentos", "Parcelamentos"],
  ["/tendencias", "Tendências"],
  ["/importar", "Importar"],
  ["/config", "Configurações"],
] as const;
```

e

```tsx
  // matriz de meses precisa da tela toda
  const wide = pathname === "/tendencias" || pathname === "/parcelamentos";
```

- [ ] **Step 5: CSS**

Acrescentar ao final de `frontend/src/styles/pages.css`:

```css
/* ---------- Parcelamentos ---------- */

.inst-scroll {
  overflow-x: auto;
}

.inst-grid {
  display: grid;
  column-gap: 12px;
  row-gap: 6px;
  align-items: baseline;
  min-width: max-content;
}

.inst-head {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.inst-cell-cat {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inst-grid .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.inst-zero {
  color: var(--muted);
}

.inst-orc {
  display: block;
  font-size: 11px;
  color: var(--muted);
}

.inst-total {
  font-weight: 600;
  border-top: 1px solid var(--border, rgba(128, 128, 128, 0.25));
  padding-top: 6px;
}

.inst-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--muted);
}

.inst-table {
  width: 100%;
  border-collapse: collapse;
}

.inst-table th {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: left;
  padding: 6px 12px 6px 0;
}

.inst-table td {
  padding: 6px 12px 6px 0;
  border-top: 1px solid var(--border, rgba(128, 128, 128, 0.15));
}

.inst-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

Antes de fechar, conferir em `tokens.css` se `--border` existe; se o token de borda tiver outro nome (ex.: `--line`), usar o existente e remover o fallback.

- [ ] **Step 6: Build e smoke**

Run: `cd frontend && npm test && npm run build`
Expected: testes PASS, build sem erro de TypeScript.

Smoke manual (`./run.sh` já servindo `frontend/dist` na porta 8000): abrir `http://localhost:8000/#/parcelamentos` e conferir: KPIs, matriz com tons, lista com badge de parcela, empty state ao navegar para um mês sem parcelas.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Installments.tsx frontend/src/components/installments/ frontend/src/App.tsx frontend/src/components/Layout.tsx frontend/src/styles/pages.css
git commit -m "feat(parcelamentos): tela /parcelamentos com matriz e lista de compras"
```

---

### Task 9: Verificação final

- [ ] **Step 1: Suítes completas**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q && cd ../frontend && npm test && npm run build`
Expected: tudo PASS, build ok.

- [ ] **Step 2: Lint frontend**

Run: `cd frontend && npx oxlint src`
Expected: sem erros novos.

- [ ] **Step 3: Sanidade do banco real**

Run: `curl -s "http://localhost:8000/api/installments/projection?month=2026-07" | head -c 400`
(com o servidor rodando via `./run.sh`)
Expected: JSON com `categorias`/`series` das faturas Bradesco de julho — os 19 falsos positivos de Pix da conta corrente **não** aparecem.

- [ ] **Step 4: Revisão final única**

Conforme preferência do usuário: uma revisão final (superpowers:requesting-code-review) sobre o diff completo da feature, sem revisor por task.
