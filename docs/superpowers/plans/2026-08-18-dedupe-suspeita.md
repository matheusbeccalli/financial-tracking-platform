# Suspeita de duplicata entre origens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar automaticamente a transação que parece duplicar outra já importada (mesma conta, mesmo valor, data próxima, lote diferente) e dar ao usuário as ações de apagar a transação e dispensar a marca.

**Architecture:** Um módulo puro (`app/services/suspect.py`) decide a gêmea; `import_parsed` o chama depois do flush, então arquivo e Pluggy passam pelo mesmo caminho. A marca é a coluna `duplicate_of_id` na própria tabela, apontando da linha nova para a antiga. A API expõe a gêmea resolvida, um `DELETE` e um `POST .../not-duplicate`; o frontend mostra badge, chip de filtro e botão apagar.

**Tech Stack:** FastAPI + SQLAlchemy 2 (Mapped/mapped_column) + SQLite, pytest; React + TypeScript + React Query + vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-dedupe-suspeita-design.md`

**Comandos do worktree:**
- backend: `cd backend && /home/mathe/programming/financial-tracking-platform/backend/.venv/bin/python -m pytest -q`
- frontend: `cd frontend && npm test -- --run`

Baseline antes de começar: backend 157 passed, frontend 169 passed.

---

### Task 1: Coluna `duplicate_of_id` e migração one-off

O projeto não usa Alembic — `init_db` chama `create_all`, que não altera tabela
existente. Bancos já criados precisam de um script, no padrão do
`scripts/migrate_dedupe_hash_v2.py`.

**Files:**
- Modify: `backend/app/models.py:53` (fim da classe `Transaction`)
- Create: `scripts/migrate_add_duplicate_of.py`
- Test: `backend/tests/test_migrate_add_duplicate_of.py`

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/test_migrate_add_duplicate_of.py`:

```python
"""O script one-off que adiciona duplicate_of_id em bancos já existentes."""
import importlib.util
import sqlite3
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "migrate_add_duplicate_of.py"


def load_script():
    spec = importlib.util.spec_from_file_location("migrate_add_duplicate_of", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def make_old_db(path: Path) -> None:
    con = sqlite3.connect(path)
    con.execute(
        "CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id INTEGER, "
        "date DATE, description TEXT, normalized TEXT, amount_cents INTEGER, "
        "category_id INTEGER, source TEXT, dedupe_hash TEXT, batch_id INTEGER, "
        "installment TEXT, ignored BOOLEAN)"
    )
    con.commit()
    con.close()


def columns(path: Path) -> list[str]:
    con = sqlite3.connect(path)
    cols = [r[1] for r in con.execute("PRAGMA table_info(transactions)")]
    con.close()
    return cols


def test_adiciona_a_coluna(tmp_path):
    db = tmp_path / "financas.db"
    make_old_db(db)
    mod = load_script()
    assert mod.migrate(db) is True
    assert "duplicate_of_id" in columns(db)


def test_rodar_de_novo_nao_faz_nada(tmp_path):
    db = tmp_path / "financas.db"
    make_old_db(db)
    mod = load_script()
    mod.migrate(db)
    assert mod.migrate(db) is False
    assert columns(db).count("duplicate_of_id") == 1
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ../backend/.venv/bin/python -m pytest tests/test_migrate_add_duplicate_of.py -q`
Expected: FAIL — `FileNotFoundError` / `spec_from_file_location` retorna None, porque o script ainda não existe.

- [ ] **Step 3: Criar o script**

Criar `scripts/migrate_add_duplicate_of.py`:

```python
"""Migração one-off (2026-08-18): coluna transactions.duplicate_of_id.

`init_db` usa create_all, que não altera tabela existente. Esta coluna guarda a
suspeita de duplicata: a linha nova aponta para a que ela parece duplicar.

Uso: backend/.venv/bin/python scripts/migrate_add_duplicate_of.py
"""

import shutil
import sqlite3
import sys
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
DB = BACKEND / "financas.db"


def migrate(db: Path) -> bool:
    """Adiciona a coluna se faltar. True = alterou, False = já existia."""
    con = sqlite3.connect(db)
    try:
        cols = [r[1] for r in con.execute("PRAGMA table_info(transactions)")]
        if "duplicate_of_id" in cols:
            return False
        con.execute(
            "ALTER TABLE transactions ADD COLUMN duplicate_of_id INTEGER "
            "REFERENCES transactions(id)"
        )
        con.commit()
        return True
    finally:
        con.close()


def main() -> None:
    if not DB.exists():
        sys.exit(f"{DB} não existe")
    backup = BACKEND / f"financas-pre-duplicate-of-{date.today():%Y%m%d}.db"
    if backup.exists():
        sys.exit(f"backup {backup.name} já existe; remova antes de rodar de novo")
    shutil.copy2(DB, backup)
    if migrate(DB):
        print(f"coluna duplicate_of_id adicionada (backup em {backup.name})")
    else:
        print("coluna duplicate_of_id já existia; nada a fazer")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && ../backend/.venv/bin/python -m pytest tests/test_migrate_add_duplicate_of.py -q`
Expected: PASS (2 passed)

- [ ] **Step 5: Adicionar a coluna ao modelo**

Em `backend/app/models.py`, dentro de `class Transaction`, logo depois de
`ignored`:

```python
    ignored: Mapped[bool] = mapped_column(default=False)
    # Suspeita de duplicata: aponta para a linha que esta parece duplicar.
    # Preenchida no import; o usuário resolve apagando uma ou dispensando.
    duplicate_of_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("transactions.id"), default=None
    )
```

- [ ] **Step 6: Rodar a suíte inteira**

Run: `cd backend && ../backend/.venv/bin/python -m pytest -q`
Expected: PASS — 159 passed (157 do baseline + 2 novos)

- [ ] **Step 7: Commit**

```bash
git add backend/app/models.py scripts/migrate_add_duplicate_of.py backend/tests/test_migrate_add_duplicate_of.py
git commit -m "feat(dedupe): coluna duplicate_of_id e migracao one-off"
```

---

### Task 2: Módulo que escolhe a gêmea

**Files:**
- Create: `backend/app/services/suspect.py`
- Test: `backend/tests/test_suspect.py`

- [ ] **Step 1: Escrever os testes que falham**

Criar `backend/tests/test_suspect.py`:

```python
"""Regra da suspeita de duplicata entre origens."""
from datetime import date

from app.models import Transaction
from app.services.suspect import find_twin, mark_suspects


def add(session, *, batch_id, dia, cents=-150000, desc="X", installment=None,
        duplicate_of_id=None):
    tx = Transaction(
        account_id=1,
        date=date(2026, 8, dia),
        description=desc,
        normalized=desc.upper(),
        amount_cents=cents,
        dedupe_hash=f"h-{batch_id}-{dia}-{cents}-{desc}",
        batch_id=batch_id,
        installment=installment,
        duplicate_of_id=duplicate_of_id,
    )
    session.add(tx)
    session.flush()
    return tx


def test_marca_mesmo_valor_em_lote_diferente(session):
    velha = add(session, batch_id=1, dia=10)
    nova = add(session, batch_id=2, dia=12, desc="OUTRA DESCRICAO")
    assert find_twin(session, nova, set()) is velha


def test_nao_marca_fora_da_janela_de_tres_dias(session):
    add(session, batch_id=1, dia=10)
    nova = add(session, batch_id=2, dia=14, desc="OUTRA DESCRICAO")
    assert find_twin(session, nova, set()) is None


def test_nao_marca_dentro_do_mesmo_lote(session):
    """Dois lançamentos iguais no mesmo arquivo são legítimos (ex.: dois TEDs
    de R$ 1.500 no mesmo dia para pessoas diferentes)."""
    add(session, batch_id=1, dia=10, desc="TED IVETTE")
    nova = add(session, batch_id=1, dia=10, desc="TED DARIO")
    assert find_twin(session, nova, set()) is None


def test_nao_marca_parcelas_diferentes(session):
    """`HUGO BOSS 1/10` e `2/10` dividem data e valor por serem parcelas da
    mesma compra, em faturas diferentes."""
    add(session, batch_id=1, dia=10, desc="HUGO BOSS 2/10", installment="2/10")
    nova = add(session, batch_id=2, dia=10, desc="HUGO BOSS 1/10", installment="1/10")
    assert find_twin(session, nova, set()) is None


def test_marca_quando_so_uma_tem_parcela(session):
    """No cartão, o CSV traz `1/2` e a Pluggy não traz parcela nenhuma."""
    velha = add(session, batch_id=1, dia=10, desc="PG *CALVIN KLEIN 1/2", installment="1/2")
    nova = add(session, batch_id=2, dia=10, desc="PG *CALVIN KLEIN")
    assert find_twin(session, nova, set()) is velha


def test_escolhe_a_gemea_mais_proxima(session):
    add(session, batch_id=1, dia=9, desc="LONGE")
    perto = add(session, batch_id=1, dia=11, desc="PERTO")
    nova = add(session, batch_id=2, dia=12, desc="NOVA")
    assert find_twin(session, nova, set()) is perto


def test_desempate_pelo_menor_id(session):
    primeira = add(session, batch_id=1, dia=10, desc="A")
    add(session, batch_id=1, dia=10, desc="B")
    nova = add(session, batch_id=2, dia=10, desc="NOVA")
    assert find_twin(session, nova, set()) is primeira


def test_gemea_ja_reclamada_nao_conta(session):
    velha = add(session, batch_id=1, dia=10)
    nova = add(session, batch_id=2, dia=10, desc="NOVA")
    assert find_twin(session, nova, {velha.id}) is None


def test_nao_encadeia_marca_sobre_marca(session):
    origem = add(session, batch_id=1, dia=10, desc="ORIGEM")
    add(session, batch_id=2, dia=10, desc="JA MARCADA", duplicate_of_id=origem.id)
    nova = add(session, batch_id=3, dia=10, desc="NOVA")
    assert find_twin(session, nova, set()) is origem


def test_sem_candidata(session):
    nova = add(session, batch_id=2, dia=10)
    assert find_twin(session, nova, set()) is None


def test_mark_suspects_marca_e_conta(session):
    velha = add(session, batch_id=1, dia=10)
    nova = add(session, batch_id=2, dia=10, desc="NOVA")
    assert mark_suspects(session, [nova]) == 1
    assert nova.duplicate_of_id == velha.id


def test_mark_suspects_nao_usa_a_mesma_gemea_duas_vezes(session):
    velha = add(session, batch_id=1, dia=10)
    nova1 = add(session, batch_id=2, dia=10, desc="NOVA 1")
    nova2 = add(session, batch_id=2, dia=10, desc="NOVA 2")
    assert mark_suspects(session, [nova1, nova2]) == 1
    assert nova1.duplicate_of_id == velha.id
    assert nova2.duplicate_of_id is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ../backend/.venv/bin/python -m pytest tests/test_suspect.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.suspect'`

- [ ] **Step 3: Escrever o módulo**

Criar `backend/app/services/suspect.py`:

```python
"""Suspeita de duplicata entre origens.

O dedupe_hash inclui a descrição (app/dedupe.py), e o mesmo lançamento chega
com texto diferente conforme a origem — OFX, CSV de fatura e Pluggy. Aqui
procuramos, para cada linha nova, uma já existente com a mesma conta e o mesmo
valor numa janela de dias. Nada é apagado nem escondido: quem decide é o
usuário, porque a regra tem falso positivo possível (dois lançamentos
legítimos de mesmo valor em dias próximos).
"""
from datetime import timedelta

from sqlalchemy import select

from app.models import Transaction

WINDOW_DAYS = 3  # a Pluggy chega a datar o mesmo lançamento 1 dia depois do OFX


def _parcelas_diferentes(a: Transaction, b: Transaction) -> bool:
    """Parcelas distintas da mesma compra dividem data e valor, e não são
    duplicata: `HUGO BOSS 1/10` na fatura de um mês e `2/10` na do mês seguinte."""
    return bool(a.installment and b.installment and a.installment != b.installment)


def find_twin(session, tx: Transaction, taken: set[int]) -> Transaction | None:
    """Transação que `tx` provavelmente duplica, ou None.

    Candidata: mesma conta, mesmo valor, até WINDOW_DAYS de diferença, de outro
    lote, ainda sem marca própria e ainda não reclamada nesta rodada (`taken`).
    Vence a de data mais próxima; empate resolve pelo menor id.
    """
    stmt = select(Transaction).where(
        Transaction.id != tx.id,
        Transaction.account_id == tx.account_id,
        Transaction.amount_cents == tx.amount_cents,
        Transaction.date >= tx.date - timedelta(days=WINDOW_DAYS),
        Transaction.date <= tx.date + timedelta(days=WINDOW_DAYS),
        Transaction.batch_id != tx.batch_id,
        Transaction.duplicate_of_id.is_(None),
    )
    candidatas = [
        c
        for c in session.scalars(stmt)
        if c.id not in taken and not _parcelas_diferentes(c, tx)
    ]
    if not candidatas:
        return None
    return min(candidatas, key=lambda c: (abs((c.date - tx.date).days), c.id))


def mark_suspects(session, new: list[Transaction]) -> int:
    """Marca as linhas novas que parecem duplicar alguma existente.

    Precisa rodar depois do flush do lote: a busca é no banco, e sem id as
    linhas novas não se excluem umas às outras.
    """
    taken: set[int] = set()
    marcadas = 0
    for tx in new:
        twin = find_twin(session, tx, taken)
        if twin is None:
            continue
        tx.duplicate_of_id = twin.id
        taken.add(twin.id)
        marcadas += 1
    return marcadas
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && ../backend/.venv/bin/python -m pytest tests/test_suspect.py -q`
Expected: PASS (12 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/suspect.py backend/tests/test_suspect.py
git commit -m "feat(dedupe): regra da gemea suspeita"
```

---

### Task 3: Ligar a detecção no import

`import_parsed` é o caminho único de arquivo e de Pluggy, então uma chamada
cobre as duas origens.

**Files:**
- Modify: `backend/app/services/importer.py:38-77` (função `import_parsed`)
- Test: `backend/tests/test_importer.py` (acrescentar ao final)

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `backend/tests/test_importer.py`:

```python
def test_import_de_outra_origem_marca_suspeita(session):
    """Mesmo lançamento com a descrição que a outra origem usa: o hash não
    pega, mas a suspeita sim."""
    import_file(session, 1, "a.ofx", load("bradesco_conta.ofx"))
    session.commit()
    outra_origem = load("bradesco_conta.ofx").replace(
        b"SUPERMERCADO PAO DE ACUCAR 123456",
        b"COMPRA CARTAO VISA - SUPERMERCADO PAO DE ACUCAR - DOCTO: 99",
    )
    batch2, new2 = import_file(session, 1, "b.ofx", outra_origem)
    session.commit()
    assert batch2.new_count == 1 and batch2.dup_count == 2
    original = session.scalar(
        select(Transaction).where(Transaction.description.contains("123456"))
    )
    assert new2[0].duplicate_of_id == original.id


def test_reimport_identico_nao_marca_suspeita(session):
    """O hash já barra; nada deve ser marcado como suspeito."""
    import_file(session, 1, "a.ofx", load("bradesco_conta.ofx"))
    session.commit()
    _, new2 = import_file(session, 1, "b.ofx", load("bradesco_conta.ofx"))
    session.commit()
    assert new2 == []
    marcadas = session.scalars(
        select(Transaction).where(Transaction.duplicate_of_id.is_not(None))
    ).all()
    assert marcadas == []
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ../backend/.venv/bin/python -m pytest tests/test_importer.py -q`
Expected: FAIL em `test_import_de_outra_origem_marca_suspeita` — `assert None == 1` (nada marca ainda)

- [ ] **Step 3: Chamar `mark_suspects` no importer**

Em `backend/app/services/importer.py`, no import do topo:

```python
from app.services.suspect import mark_suspects
```

E no fim de `import_parsed`, trocar

```python
    session.flush()
    return batch, new
```

por

```python
    session.flush()  # ids das novas: mark_suspects consulta o banco
    mark_suspects(session, new)
    return batch, new
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && ../backend/.venv/bin/python -m pytest tests/test_importer.py tests/test_pluggy_sync.py -q`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/importer.py backend/tests/test_importer.py
git commit -m "feat(dedupe): marca suspeitas ao importar (arquivo e Pluggy)"
```

---

### Task 4: API expõe a gêmea

**Files:**
- Modify: `backend/app/routers/transactions.py:1-48` (imports, `tx_out`, `list_transactions`, `patch_transaction`)
- Test: `backend/tests/test_api_tx_duplicates.py` (novo)

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/test_api_tx_duplicates.py`:

```python
"""Suspeita de duplicata na API de transações."""
from datetime import date

from app.models import ImportBatch, Transaction


def seed_par(session):
    """Devolve (velha do OFX, nova da Pluggy marcada como suspeita)."""
    b1 = ImportBatch(source="ofx", filename="Bradesco_14082026.ofx")
    b2 = ImportBatch(source="pluggy", filename="Pluggy · Bradesco Conta · 2026-08-17")
    session.add_all([b1, b2])
    session.flush()
    velha = Transaction(
        account_id=1, date=date(2026, 8, 13),
        description="Cartao Visa Electron D.b. Ortho Servic",
        normalized="CARTAO VISA ELECTRON D B ORTHO SERVIC",
        amount_cents=-170000, dedupe_hash="h-velha", batch_id=b1.id,
    )
    session.add(velha)
    session.flush()
    nova = Transaction(
        account_id=1, date=date(2026, 8, 13),
        description="COMPRA CARTAO VISA - D.B. ORTHO SERVIC - DOCTO: 189385",
        normalized="COMPRA CARTAO VISA D B ORTHO SERVIC DOCTO",
        amount_cents=-170000, dedupe_hash="h-nova", batch_id=b2.id,
        duplicate_of_id=velha.id,
    )
    session.add(nova)
    session.commit()
    return velha, nova


def linha(client, tx_id, month="2026-08"):
    body = client.get(f"/api/transactions?month={month}").json()
    return next(t for t in body if t["id"] == tx_id)


def test_lista_traz_a_gemea_resolvida(client, session):
    velha, nova = seed_par(session)
    t = linha(client, nova.id)
    assert t["duplicate_of_id"] == velha.id
    assert t["duplicate_of"] == {
        "id": velha.id,
        "date": "2026-08-13",
        "description": "Cartao Visa Electron D.b. Ortho Servic",
        "origin": "ofx",
    }


def test_linha_sem_suspeita_vem_com_campos_nulos(client, session):
    velha, _ = seed_par(session)
    t = linha(client, velha.id)
    assert t["duplicate_of_id"] is None
    assert t["duplicate_of"] is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ../backend/.venv/bin/python -m pytest tests/test_api_tx_duplicates.py -q`
Expected: FAIL — `KeyError: 'duplicate_of_id'`

- [ ] **Step 3: Resolver as gêmeas em `tx_out`**

Em `backend/app/routers/transactions.py`, trocar o import dos modelos e a
função `tx_out`, e ajustar as duas rotas existentes:

```python
from app.models import ImportBatch, Transaction


def resolve_twins(session, txs: list[Transaction]) -> dict[int, dict]:
    """Resumo das gêmeas apontadas por `txs`, em uma consulta só (sem N+1)."""
    ids = {t.duplicate_of_id for t in txs if t.duplicate_of_id is not None}
    if not ids:
        return {}
    rows = session.execute(
        select(
            Transaction.id,
            Transaction.date,
            Transaction.description,
            ImportBatch.source,
        )
        .join(ImportBatch, ImportBatch.id == Transaction.batch_id, isouter=True)
        .where(Transaction.id.in_(ids))
    )
    return {
        r.id: {
            "id": r.id,
            "date": r.date.isoformat(),
            "description": r.description,
            "origin": r.source,
        }
        for r in rows
    }


def tx_out(t: Transaction, twins: dict[int, dict]) -> dict:
    return {
        "id": t.id, "account_id": t.account_id, "date": t.date.isoformat(),
        "description": t.description, "amount_cents": t.amount_cents,
        "category_id": t.category_id, "source": t.source,
        "installment": t.installment, "ignored": t.ignored,
        "duplicate_of_id": t.duplicate_of_id,
        "duplicate_of": twins.get(t.duplicate_of_id) if t.duplicate_of_id else None,
    }
```

No fim de `list_transactions`, trocar o `return`:

```python
    txs = list(session.scalars(stmt))
    twins = resolve_twins(session, txs)
    return [tx_out(t, twins) for t in txs]
```

E no fim de `patch_transaction`:

```python
    session.commit()
    return tx_out(tx, resolve_twins(session, [tx]))
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && ../backend/.venv/bin/python -m pytest tests/test_api_tx_duplicates.py tests/test_api_tx_budget.py -q`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/transactions.py backend/tests/test_api_tx_duplicates.py
git commit -m "feat(dedupe): API devolve a gemea da suspeita"
```

---

### Task 5: `DELETE /api/transactions/{id}`

Hoje não existe apagar transação: o ⊘ cria `ignore_rule` retroativa por
descrição, que é outra coisa.

**Files:**
- Modify: `backend/app/routers/transactions.py` (nova rota no fim do arquivo)
- Test: `backend/tests/test_api_tx_duplicates.py` (acrescentar)

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `backend/tests/test_api_tx_duplicates.py`:

```python
def test_delete_apaga_a_transacao(client, session):
    _, nova = seed_par(session)
    assert client.delete(f"/api/transactions/{nova.id}").status_code == 204
    ids = [t["id"] for t in client.get("/api/transactions?month=2026-08").json()]
    assert nova.id not in ids


def test_delete_da_gemea_limpa_a_marca_da_outra(client, session):
    velha, nova = seed_par(session)
    assert client.delete(f"/api/transactions/{velha.id}").status_code == 204
    t = linha(client, nova.id)
    assert t["duplicate_of_id"] is None
    assert t["duplicate_of"] is None


def test_delete_inexistente_404(client):
    assert client.delete("/api/transactions/9999").status_code == 404
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ../backend/.venv/bin/python -m pytest tests/test_api_tx_duplicates.py -q`
Expected: FAIL — 405 Method Not Allowed em vez de 204

- [ ] **Step 3: Escrever a rota**

Em `backend/app/routers/transactions.py`, acrescentar `update` ao import do
SQLAlchemy e a rota no fim do arquivo:

```python
from sqlalchemy import select, update
```

```python
@router.delete("/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, session=Depends(get_session)):
    """Apaga de vez — usado para resolver duplicata. Ignorar é outra coisa:
    cria regra por descrição e mantém a linha."""
    tx = session.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transação não encontrada")
    session.execute(
        update(Transaction)
        .where(Transaction.duplicate_of_id == tx_id)
        .values(duplicate_of_id=None)
    )
    session.delete(tx)
    session.commit()
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && ../backend/.venv/bin/python -m pytest tests/test_api_tx_duplicates.py -q`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/transactions.py backend/tests/test_api_tx_duplicates.py
git commit -m "feat(tx): DELETE /api/transactions/{id}"
```

---

### Task 6: `POST /api/transactions/{id}/not-duplicate`

Endpoint próprio em vez de campo no `TxPatch`: o PATCH carrega intenção de
classificação (`category_id`, `ignored`), e dispensar a marca não é isso.

**Files:**
- Modify: `backend/app/routers/transactions.py` (nova rota no fim do arquivo)
- Test: `backend/tests/test_api_tx_duplicates.py` (acrescentar)

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `backend/tests/test_api_tx_duplicates.py`:

```python
def test_not_duplicate_tira_a_marca_sem_apagar(client, session):
    _, nova = seed_par(session)
    r = client.post(f"/api/transactions/{nova.id}/not-duplicate")
    assert r.status_code == 200
    assert r.json()["duplicate_of_id"] is None
    t = linha(client, nova.id)
    assert t["duplicate_of_id"] is None


def test_not_duplicate_inexistente_404(client):
    assert client.post("/api/transactions/9999/not-duplicate").status_code == 404
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ../backend/.venv/bin/python -m pytest tests/test_api_tx_duplicates.py -q`
Expected: FAIL — 404 na rota que existe (nenhuma rota casa `/not-duplicate`)

- [ ] **Step 3: Escrever a rota**

Em `backend/app/routers/transactions.py`, no fim do arquivo:

```python
@router.post("/{tx_id}/not-duplicate")
def not_duplicate(tx_id: int, session=Depends(get_session)):
    """Dispensa a suspeita: a linha continua, só perde a marca."""
    tx = session.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transação não encontrada")
    tx.duplicate_of_id = None
    session.commit()
    return tx_out(tx, {})
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && ../backend/.venv/bin/python -m pytest tests/test_api_tx_duplicates.py -q`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/transactions.py backend/tests/test_api_tx_duplicates.py
git commit -m "feat(dedupe): endpoint not-duplicate"
```

---

### Task 7: `suspect_count` nas respostas de import e sync

Sem coluna nova em `import_batch`: a contagem sai das linhas novas do lote, e o
histórico continua com novas/duplicadas.

**Files:**
- Modify: `backend/app/routers/imports.py:44-52`
- Modify: `backend/app/routers/pluggy.py:143-152`
- Test: `backend/tests/test_api_import_dashboard.py`, `backend/tests/test_api_pluggy.py`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `backend/tests/test_api_import_dashboard.py`:

```python
def test_import_responde_quantas_suspeitas(client):
    upload(client)
    outra_origem = (FIXTURES / "bradesco_conta.ofx").read_bytes().replace(
        b"SUPERMERCADO PAO DE ACUCAR 123456",
        b"COMPRA CARTAO VISA - SUPERMERCADO PAO DE ACUCAR - DOCTO: 99",
    )
    r = client.post(
        "/api/imports",
        data={"account_id": "1"},
        files={"file": ("b.ofx", outra_origem)},
    )
    assert r.status_code == 200
    assert r.json()["suspect_count"] == 1
```

Acrescentar em `backend/tests/test_api_pluggy.py`:

```python
def test_sync_responde_quantas_suspeitas(client, session):
    _mk_link(session)
    session.add(Transaction(account_id=1, date=date(2026, 8, 10), description="Uber",
                            normalized="UBER", amount_cents=-1990, dedupe_hash="h-uber",
                            batch_id=None))
    session.commit()
    use_fake(client, FakePluggyApi(txs={"acc-1": [_tx()]}))
    body = client.post("/api/pluggy/sync").json()
    assert body[0]["new_count"] == 1
    assert body[0]["suspect_count"] == 1
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && ../backend/.venv/bin/python -m pytest tests/test_api_import_dashboard.py tests/test_api_pluggy.py -q`
Expected: FAIL — `KeyError: 'suspect_count'` nos dois

- [ ] **Step 3: Contar nas duas rotas**

Em `backend/app/routers/imports.py`, dentro de `create_import`, no dicionário
de resposta, acrescentar a linha depois de `"dup_count"`:

```python
        "dup_count": batch.dup_count,
        "suspect_count": sum(1 for t in new if t.duplicate_of_id is not None),
```

Em `backend/app/routers/pluggy.py`, no `out.append({...})` do `sync`, depois de
`"dup_count"`:

```python
            "dup_count": batch.dup_count,
            "suspect_count": sum(1 for t in r["new"] if t.duplicate_of_id is not None),
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `cd backend && ../backend/.venv/bin/python -m pytest -q`
Expected: PASS — 182 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/imports.py backend/app/routers/pluggy.py backend/tests/test_api_import_dashboard.py backend/tests/test_api_pluggy.py
git commit -m "feat(dedupe): suspect_count no resultado de import e sync"
```

---

### Task 8: Tipos e hooks no frontend

**Files:**
- Modify: `frontend/src/api/types.ts:18-28` (`Tx`), `:103-110` (`ImportResult`), `:159-166` (`SyncResult`)
- Modify: `frontend/src/api/hooks.ts:117-121` (junto de `usePatchTx`)

- [ ] **Step 1: Acrescentar os campos ao tipo `Tx`**

Em `frontend/src/api/types.ts`:

```typescript
export interface TwinTx {
  id: number;
  date: string;
  description: string;
  origin: "ofx" | "csv" | "pluggy" | null;
}

export interface Tx {
  id: number;
  account_id: number;
  date: string;
  description: string;
  amount_cents: number;
  category_id: number | null;
  source: "regra" | "llm" | "manual" | null;
  installment: string | null;
  ignored: boolean;
  duplicate_of_id: number | null;
  duplicate_of: TwinTx | null;
}
```

Em `ImportResult`, acrescentar depois de `dup_count`:

```typescript
  suspect_count: number;
```

Em `SyncResult`, acrescentar depois de `dup_count?`:

```typescript
  suspect_count?: number;
```

- [ ] **Step 2: Acrescentar os hooks**

Em `frontend/src/api/hooks.ts`, logo depois de `usePatchTx`:

```typescript
export const useDeleteTx = () =>
  useInvalidatingMutation((id: number) =>
    api(`/transactions/${id}`, { method: "DELETE" })
  );

export const useNotDuplicate = () =>
  useInvalidatingMutation((id: number) =>
    api(`/transactions/${id}/not-duplicate`, { method: "POST" })
  );
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: erros APENAS em `src/lib/txTable.test.ts` (o helper `tx()` do teste
não tem os campos novos) — serão resolvidos na Task 9.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/hooks.ts
git commit -m "feat(dedupe): tipos e hooks de duplicata no frontend"
```

---

### Task 9: Filtro e texto do badge (lógica pura)

O frontend testa funções puras com vitest em `environment: "node"` — não há
testing-library nem jsdom no projeto. Então toda a lógica testável fica em
`lib/txTable.ts`, e os componentes só a consomem.

**Files:**
- Modify: `frontend/src/lib/txTable.ts:107-139`
- Test: `frontend/src/lib/txTable.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Em `frontend/src/lib/txTable.test.ts`, acrescentar os campos novos ao helper
`tx()` (senão o TypeScript reclama em todos os testes do arquivo):

```typescript
function tx(partial: Partial<Tx> & { id: number }): Tx {
  return {
    account_id: 1,
    date: "2026-07-10",
    description: "X",
    amount_cents: -1000,
    category_id: null,
    source: null,
    installment: null,
    ignored: false,
    duplicate_of_id: null,
    duplicate_of: null,
    ...partial,
  };
}
```

Trocar a linha de import existente (`src/lib/txTable.test.ts:4`) por:

```typescript
import {
  accountCounts,
  describeTwin,
  filterTxs,
  sortTxs,
  statusCounts,
  summarize,
} from "./txTable";
```

E acrescentar ao final do arquivo:

```typescript
const gemea = {
  id: 7,
  date: "2026-08-13",
  description: "Cartao Visa Electron D.b. Ortho Servic",
  origin: "ofx" as const,
};

describe("filtro de duplicadas", () => {
  it("deixa passar só as marcadas", () => {
    const rows = [
      tx({ id: 1 }),
      tx({ id: 2, duplicate_of_id: 7, duplicate_of: gemea }),
    ];
    const out = filterTxs(rows, {
      accountId: null,
      categoryId: null,
      status: "duplicadas",
    });
    expect(out.map((t) => t.id)).toEqual([2]);
  });

  it("conta as marcadas", () => {
    const c = statusCounts([
      tx({ id: 1 }),
      tx({ id: 2, duplicate_of_id: 7, duplicate_of: gemea }),
      tx({ id: 3, duplicate_of_id: 8, duplicate_of: gemea }),
    ]);
    expect(c.duplicadas).toBe(2);
  });
});

describe("describeTwin", () => {
  it("descreve a gêmea com data, origem e descrição", () => {
    expect(describeTwin(gemea)).toBe(
      "Parece duplicar: 13/08 · OFX · Cartao Visa Electron D.b. Ortho Servic"
    );
  });

  it("aceita gêmea sem origem conhecida", () => {
    expect(describeTwin({ ...gemea, origin: null })).toBe(
      "Parece duplicar: 13/08 · Cartao Visa Electron D.b. Ortho Servic"
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npm test -- --run`
Expected: FAIL — `describeTwin is not exported` e `c.duplicadas` indefinido

- [ ] **Step 3: Implementar**

Em `frontend/src/lib/txTable.ts`, trocar o bloco de `TxStatus`, `filterTxs` e
`statusCounts` por:

```typescript
/**
 * "A classificar" é o que o LLM chutou e ninguém confirmou (`source === "llm"`);
 * "sem categoria" é o que nem regra nem LLM resolveram; "duplicadas" é o que o
 * import marcou como provável repetição de outra origem.
 */
export type TxStatus = "todas" | "llm" | "sem-categoria" | "duplicadas";

export interface TxFilterState {
  accountId: number | null;
  categoryId: number | null;
  status: TxStatus;
}

export function filterTxs(txs: Tx[], f: TxFilterState): Tx[] {
  return txs.filter((t) => {
    if (f.accountId !== null && t.account_id !== f.accountId) return false;
    if (f.categoryId !== null && t.category_id !== f.categoryId) return false;
    if (f.status === "llm" && t.source !== "llm") return false;
    if (f.status === "sem-categoria" && t.category_id !== null) return false;
    if (f.status === "duplicadas" && t.duplicate_of_id === null) return false;
    return true;
  });
}

export function accountCounts(txs: Tx[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const t of txs) counts.set(t.account_id, (counts.get(t.account_id) ?? 0) + 1);
  return counts;
}

export function statusCounts(
  txs: Tx[]
): { llm: number; semCategoria: number; duplicadas: number } {
  let llm = 0;
  let semCategoria = 0;
  let duplicadas = 0;
  for (const t of txs) {
    if (t.source === "llm") llm += 1;
    if (t.category_id === null) semCategoria += 1;
    if (t.duplicate_of_id !== null) duplicadas += 1;
  }
  return { llm, semCategoria, duplicadas };
}

const ORIGIN_LABEL: Record<string, string> = {
  ofx: "OFX",
  csv: "CSV",
  pluggy: "Pluggy",
};

/** Texto do `title` do badge: com quem a linha conflita. */
export function describeTwin(twin: TwinTx): string {
  const partes = [dayMonth(twin.date)];
  if (twin.origin) partes.push(ORIGIN_LABEL[twin.origin] ?? twin.origin);
  partes.push(twin.description);
  return `Parece duplicar: ${partes.join(" · ")}`;
}
```

No topo do arquivo, acrescentar os imports que faltam:

```typescript
import type { Tx, TwinTx } from "../api/types";
import { dayMonth } from "./months";
```

(se já houver `import type { Tx } from "../api/types";`, basta acrescentar
`TwinTx` à mesma linha)

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npm test -- --run && npx tsc --noEmit`
Expected: PASS — 173 tests, tsc sem erros

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/txTable.ts frontend/src/lib/txTable.test.ts
git commit -m "feat(dedupe): filtro duplicadas e texto do badge"
```

---

### Task 10: Badge e botão apagar na tabela

**Files:**
- Modify: `frontend/src/components/transactions/TxTable.tsx`
- Modify: `frontend/src/pages/Transactions.tsx:141-151`
- Modify: `frontend/src/styles/components.css` (fim do arquivo)

- [ ] **Step 1: Acrescentar as props e a UI no TxTable**

Em `frontend/src/components/transactions/TxTable.tsx`, importar o helper:

```typescript
import { describeTwin, type SortDir, type SortKey } from "../../lib/txTable";
```

Acrescentar às props (assinatura e tipo):

```typescript
  onIgnore,
  onDelete,
  onNotDuplicate,
```

```typescript
  onIgnore: (tx: Tx) => void;
  onDelete: (tx: Tx) => void;
  onNotDuplicate: (tx: Tx) => void;
```

Na célula da descrição, depois do `tx-parcela`, acrescentar o badge:

```tsx
              <td className="tx-col-desc">
                <span className="tx-desc">{t.description}</span>
                {t.installment && <span className="tx-parcela mono">{t.installment}</span>}
                {t.duplicate_of && (
                  <span className="tx-dup" title={describeTwin(t.duplicate_of)}>
                    possível duplicata
                    <button
                      type="button"
                      className="tx-dup-x"
                      title="Não é duplicata — tirar a marca"
                      onClick={() => onNotDuplicate(t)}
                    >
                      ✕
                    </button>
                  </span>
                )}
              </td>
```

Na célula de ações, acrescentar o botão apagar depois do de ignorar:

```tsx
              <td className="tx-col-ignore">
                <button
                  className="ghost tx-ignore"
                  title={
                    t.ignored
                      ? "Voltar a contar (remove a regra de ignorar)"
                      : "Ignorar (cria regra: futuras com esta descrição também)"
                  }
                  onClick={() => onIgnore(t)}
                >
                  {t.ignored ? "↩" : "⊘"}
                </button>
                <button
                  className="ghost tx-delete"
                  title="Apagar este lançamento (não tem volta)"
                  onClick={() => onDelete(t)}
                >
                  🗑
                </button>
              </td>
```

- [ ] **Step 2: Ligar na página**

Em `frontend/src/pages/Transactions.tsx`, acrescentar os hooks junto de
`const patchTx = usePatchTx();`:

```typescript
  const deleteTx = useDeleteTx();
  const notDuplicate = useNotDuplicate();
```

E no import de `../api/hooks`, acrescentar `useDeleteTx` e `useNotDuplicate`.

No `<TxTable ... />`, depois da prop `onIgnore`:

```tsx
          onDelete={(t) => {
            if (
              window.confirm(
                `Apagar "${t.description}"? Não tem volta — reimportar o arquivo traz de volta.`
              )
            ) {
              deleteTx.mutate(t.id);
            }
          }}
          onNotDuplicate={(t) => notDuplicate.mutate(t.id)}
```

- [ ] **Step 3: Estilo do badge**

No fim de `frontend/src/styles/components.css`:

```css
/* Suspeita de duplicata: marca discreta na linha, com ✕ para dispensar. */
.tx-dup {
  margin-left: 8px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--warn);
  border: 1px solid var(--warn);
  white-space: nowrap;
}

.tx-dup-x {
  margin-left: 4px;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  padding: 0;
}

.tx-delete {
  margin-left: 4px;
}
```

`--warn` e `--tint-warn` já existem em `frontend/src/styles/tokens.css:29,35`
(claro) e `:82,88` (escuro), nos dois temas.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test -- --run && npm run build`
Expected: tsc limpo, 173 tests passed, build OK

(Não há teste de render no projeto — vitest roda em `environment: "node"`, sem
jsdom nem testing-library. A verificação visual é o passo seguinte.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/transactions/TxTable.tsx frontend/src/pages/Transactions.tsx frontend/src/styles/components.css
git commit -m "feat(dedupe): badge de suspeita e botao apagar na tabela"
```

---

### Task 11: Chip no filtro e métrica no card de import

**Files:**
- Modify: `frontend/src/components/transactions/FilterBar.tsx:69-76`
- Modify: `frontend/src/components/imports/ResultCard.tsx:53-56`

- [ ] **Step 1: Chip na FilterBar**

Em `frontend/src/components/transactions/FilterBar.tsx`, dentro da
`div.tx-chip-row--split`, depois do chip "Sem categoria":

```tsx
        <Chip
          tone="warn"
          active={status === "duplicadas"}
          onClick={() => toggle("duplicadas")}
        >
          Duplicadas <span className="mono">{estados.duplicadas}</span>
        </Chip>
```

- [ ] **Step 2: Métrica no ResultCard**

Em `frontend/src/components/imports/ResultCard.tsx`, depois da métrica
"Duplicadas":

`Tone` já aceita `"warn"` (`frontend/src/lib/tone.ts:2`). O `?? 0` é necessário
porque o SyncCard renderiza o mesmo `ResultCard` com o resultado do sync, e
`SyncResult.suspect_count` é opcional:

```tsx
        <Metric label="Duplicadas" v={r.dup_count} tone="muted" />
        {(r.suspect_count ?? 0) > 0 && (
          <Metric label="Possíveis duplicatas" v={r.suspect_count ?? 0} tone="warn" />
        )}
```

Assim a métrica aparece nos dois caminhos (arquivo e sync) sem mudança extra no
SyncCard.

- [ ] **Step 3: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test -- --run && npm run build`
Expected: tsc limpo, 173 tests passed, build OK

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/transactions/FilterBar.tsx frontend/src/components/imports/ResultCard.tsx
git commit -m "feat(dedupe): chip Duplicadas e metrica no card de import"
```

---

### Task 12: Verificação de ponta a ponta no app real

**Files:** nenhum — é execução e conferência.

- [ ] **Step 1: Rodar as duas suítes**

Run: `cd backend && ../backend/.venv/bin/python -m pytest -q && cd ../frontend && npm test -- --run`
Expected: backend 182 passed, frontend 173 passed

- [ ] **Step 2: Migrar uma cópia do banco real**

```bash
cp /home/mathe/programming/financial-tracking-platform/backend/financas.db backend/financas.db
/home/mathe/programming/financial-tracking-platform/backend/.venv/bin/python scripts/migrate_add_duplicate_of.py
```

Expected: `coluna duplicate_of_id adicionada (backup em financas-pre-duplicate-of-20260818.db)`

- [ ] **Step 3: Subir o app e conferir na tela**

Run: `./run.sh` (na raiz do worktree)

Conferir, na tela Transações: o chip "Duplicadas" aparece com contagem 0 (o
banco está limpo desde 18/08), o botão 🗑 aparece em toda linha e pede
confirmação, e apagar uma linha a remove da lista.

- [ ] **Step 4: Provar a detecção com um import real**

Importar de novo, pela tela Importar, o OFX `Bradesco_14082026_200215.ofx` na
conta Bradesco Conta. Esperado: as linhas idênticas deduplicam pelo hash como
sempre, e qualquer lançamento que a Pluggy já tenha trazido com outra descrição
aparece com "Possíveis duplicatas" no card e badge na lista.

- [ ] **Step 5: Commit final e relatório**

```bash
git status   # deve estar limpo; o .db não é versionado
```

Relatar: contagem de testes, o que foi visto na tela e o que ficou de fora.

---

## Notas de execução

- O `.db` de trabalho do worktree é descartável e está no `.gitignore`; a
  migração do banco de verdade (`backend/financas.db` do diretório principal) só
  acontece quando o merge for feito, e o script faz backup sozinho.
- Nenhuma tarefa apaga dado existente. A limpeza das 35 duplicatas antigas já
  foi feita à mão em 17 e 18/08 e está fora deste plano.
