# Import Progress & Background Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/imports` responde em ~1s, classificação LLM roda em background com progresso consultável, e o event loop nunca mais congela.

**Architecture:** `classifier.py` é decomposto em `apply_rules`/`llm_context`/`classify_chunk` (reutilizados por `classify_new`). Novo `classify_job.py` com registro em memória `JOBS` e `run_classification` (síncrona, roda em threadpool via `BackgroundTasks`, commit por lote). Router: `create_import` vira `def`, agenda o job e ganha `GET /imports/{id}/classification`. Frontend: novo tipo `ClassificationProgress`, hook `useClassification` com polling de 1,5s e componente `ClassificationStatus`.

**Tech Stack:** FastAPI/SQLAlchemy/pytest no backend; React/TanStack Query/Vitest no frontend. Sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-08-07-import-progress-design.md`

---

## File Structure

- Modify: `backend/app/services/classifier.py` — decompõe `classify_new`
- Create: `backend/app/services/classify_job.py` — job em background + status
- Modify: `backend/app/routers/imports.py` — endpoint rápido + progresso
- Modify: `backend/app/services/llm.py` — timeout/max_retries no cliente
- Modify: `backend/tests/conftest.py` — fixture autouse limpando `JOBS`
- Modify: `backend/tests/test_api_import_dashboard.py` — novo shape da resposta
- Create: `backend/tests/test_classify_job.py` — job, status, timeout
- Modify: `frontend/src/api/types.ts`, `frontend/src/api/hooks.ts`
- Create: `frontend/src/components/ClassificationStatus.tsx` (+ teste)
- Modify: `frontend/src/pages/Imports.tsx`

Contexto para o executor:

- Branch atual: `feature/import-progress` (já em checkout; não troque).
- Testes backend: `cd backend && .venv/bin/pytest` (hoje: 81 passed).
  Frontend: `cd frontend && npm test -- --run` e `npm run build` (typecheck).
- A fixture autouse `no_real_api_key` (conftest) zera a API key nos testes —
  `get_llm` retorna `None`; caminhos com LLM usam fakes via monkeypatch.
- `TestClient` executa `BackgroundTasks` antes de `client.post()` retornar —
  o estado "running" só é observável na resposta do POST (snapshot); depois
  do POST o job já rodou.
- `job_status` seleciona colunas (não entidades) de propósito: evita identity
  map desatualizado quando a sessão do teste é reutilizada.

---

### Task 1: Backend — job em background, endpoint de progresso, timeout LLM

**Files:**
- Modify: `backend/app/services/classifier.py`
- Create: `backend/app/services/classify_job.py`
- Modify: `backend/app/routers/imports.py`
- Modify: `backend/app/services/llm.py`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/test_api_import_dashboard.py`
- Create: `backend/tests/test_classify_job.py`

- [ ] **Step 1: Write the failing tests**

Criar `backend/tests/test_classify_job.py`:

```python
import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.models import Transaction
from app.services import classify_job
from app.services.classify_job import JOBS, job_status, run_classification
from app.services.importer import import_file

CSV = (
    "Data;Histórico;Valor\n"
    "01/07/2026;LOJA A;-10,00\n"
    "02/07/2026;LOJA B;-20,00\n"
    "03/07/2026;LOJA C;-30,00\n"
).encode("utf-8")


class FakeLLM:
    def __init__(self):
        self.calls = 0

    def classify(self, items, categories, examples=None):
        self.calls += 1
        return {item["id"]: categories[0] for item in items}


def _import_batch(session):
    batch, new = import_file(session, 1, "t.csv", CSV)
    session.commit()
    return batch


def test_run_classification_classifies_all_and_marks_done(session, monkeypatch):
    batch = _import_batch(session)
    fake = FakeLLM()
    monkeypatch.setattr(classify_job, "SessionLocal", sessionmaker(bind=session.get_bind()))
    monkeypatch.setattr(classify_job, "get_llm", lambda s: fake)

    run_classification(batch.id)

    assert JOBS[batch.id] == "done"
    st = job_status(session, batch.id)
    assert st["status"] == "done"
    assert st["total"] == 3 and st["done"] == 3
    assert st["counts"]["llm"] == 3 and st["counts"]["pendente"] == 0


def test_run_classification_chunks_by_batch_size(session, monkeypatch):
    batch = _import_batch(session)
    fake = FakeLLM()
    monkeypatch.setattr(classify_job, "SessionLocal", sessionmaker(bind=session.get_bind()))
    monkeypatch.setattr(classify_job, "get_llm", lambda s: fake)
    monkeypatch.setattr(classify_job, "LLM_BATCH_SIZE", 2)

    run_classification(batch.id)

    assert fake.calls == 2  # 3 pendentes em lotes de 2 => 2 chamadas


def test_run_classification_error_marks_error(session, monkeypatch):
    batch = _import_batch(session)

    class Boom:
        def classify(self, items, categories, examples=None):
            raise RuntimeError("api caiu")

    monkeypatch.setattr(classify_job, "SessionLocal", sessionmaker(bind=session.get_bind()))
    monkeypatch.setattr(classify_job, "get_llm", lambda s: Boom())

    run_classification(batch.id)

    assert JOBS[batch.id] == "error"


def test_job_status_without_entry_derives_interrupted_or_done(session):
    batch = _import_batch(session)
    assert job_status(session, batch.id)["status"] == "interrupted"  # pendentes, sem job
    for tx in session.scalars(select(Transaction)):
        tx.category_id, tx.source = 1, "llm"
    session.flush()
    assert job_status(session, batch.id)["status"] == "done"


def test_llm_client_has_timeout_and_limited_retries():
    from app.services.llm import AnthropicLLM

    llm = AnthropicLLM("sk-test", "claude-haiku-4-5")
    assert llm.client.timeout == 120.0
    assert llm.client.max_retries == 1
```

Em `backend/tests/test_api_import_dashboard.py`, SUBSTITUIR o teste
`test_import_endpoint_returns_summary` por:

```python
def test_import_endpoint_returns_summary(client):
    r = upload(client)
    assert r.status_code == 200
    body = r.json()
    assert body["new_count"] == 3 and body["dup_count"] == 0
    # 3 novas, 1 ignorada (pagto fatura) => 2 classificáveis; sem LLM: done na hora
    assert body["classification"] == {
        "status": "done",
        "total": 2,
        "done": 0,
        "counts": {"regra": 0, "llm": 0, "pendente": 2},
    }
```

e ADICIONAR ao final do mesmo arquivo:

```python
def test_classification_endpoint_and_404(client):
    batch_id = upload(client).json()["batch_id"]
    r = client.get(f"/api/imports/{batch_id}/classification")
    assert r.status_code == 200 and r.json()["status"] == "done"
    assert client.get("/api/imports/999/classification").status_code == 404


def test_import_with_llm_schedules_background_classification(client, session, monkeypatch):
    from sqlalchemy.orm import sessionmaker

    import app.routers.imports as imports_router
    from app.services import classify_job

    class FakeLLM:
        def classify(self, items, categories, examples=None):
            return {item["id"]: categories[0] for item in items}

    fake = FakeLLM()
    monkeypatch.setattr(imports_router, "get_llm", lambda s: fake)
    monkeypatch.setattr(classify_job, "get_llm", lambda s: fake)
    monkeypatch.setattr(
        classify_job, "SessionLocal", sessionmaker(bind=session.get_bind())
    )

    body = upload(client).json()
    assert body["classification"]["status"] == "running"  # snapshot na resposta
    r = client.get(f"/api/imports/{body['batch_id']}/classification").json()
    assert r["status"] == "done" and r["counts"]["llm"] == 2 and r["done"] == 2
```

Em `backend/tests/conftest.py`, ADICIONAR ao final:

```python
@pytest.fixture(autouse=True)
def clean_jobs():
    from app.services.classify_job import JOBS

    JOBS.clear()
    yield
    JOBS.clear()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_classify_job.py -v`
Expected: FAIL na coleta com `ModuleNotFoundError: No module named 'app.services.classify_job'`

- [ ] **Step 3: Refactor `classifier.py`**

Substituir o conteúdo de `backend/app/services/classifier.py` do início até a
função `classify_new` INCLUSIVE (mantendo `apply_ignore` e `apply_correction`
intocadas no fim do arquivo) por:

```python
from sqlalchemy import select

from app.models import Category, IgnoreRule, Rule, Transaction

LLM_BATCH_SIZE = 50


def apply_rules(session, txs: list[Transaction]) -> tuple[int, list[Transaction]]:
    n_regra = 0
    pending: list[Transaction] = []
    for tx in txs:
        if tx.ignored or tx.category_id is not None:
            continue
        rule = session.scalar(select(Rule).where(Rule.matcher == tx.normalized))
        if rule:
            tx.category_id, tx.source = rule.category_id, "regra"
            n_regra += 1
        else:
            pending.append(tx)
    return n_regra, pending


def llm_context(session) -> tuple[dict[str, int], list[dict]]:
    by_name = {
        c.name: c.id
        for c in session.scalars(select(Category).where(~Category.archived))
    }
    by_id = {v: k for k, v in by_name.items()}
    examples = [
        {"descricao": r.matcher, "categoria": by_id[r.category_id]}
        for r in session.scalars(select(Rule).order_by(Rule.id.desc()).limit(10))
        if r.category_id in by_id
    ]
    return by_name, examples


def classify_chunk(
    session, chunk: list[Transaction], llm, by_name: dict[str, int], examples: list[dict]
) -> tuple[int, int]:
    items = [
        {"id": t.id, "descricao": t.description, "valor_centavos": t.amount_cents}
        for t in chunk
    ]
    result = llm.classify(items, list(by_name), examples)  # dict[tx_id, nome]
    n_llm = n_pend = 0
    for t in chunk:
        name = result.get(t.id)
        if name in by_name:
            t.category_id, t.source = by_name[name], "llm"
            n_llm += 1
        else:
            n_pend += 1
    return n_llm, n_pend


def classify_new(session, txs: list[Transaction], llm) -> dict[str, int]:
    counts = {"regra": 0, "llm": 0, "pendente": 0}
    counts["regra"], pending = apply_rules(session, txs)
    if pending and llm is not None:
        by_name, examples = llm_context(session)
        for i in range(0, len(pending), LLM_BATCH_SIZE):
            chunk = pending[i : i + LLM_BATCH_SIZE]
            n_llm, n_pend = classify_chunk(session, chunk, llm, by_name, examples)
            counts["llm"] += n_llm
            counts["pendente"] += n_pend
    else:
        counts["pendente"] += len(pending)
    return counts
```

- [ ] **Step 4: Create `classify_job.py`**

Criar `backend/app/services/classify_job.py`:

```python
import logging

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Transaction
from app.services.classifier import LLM_BATCH_SIZE, classify_chunk, llm_context
from app.services.llm import get_llm

# batch_id -> "running" | "done" | "error". Em memória de propósito: app
# single-user local; contagens vêm sempre do banco (job_status).
JOBS: dict[int, str] = {}


def run_classification(batch_id: int) -> None:
    session = SessionLocal()
    try:
        llm = get_llm(session)
        pending = list(
            session.scalars(
                select(Transaction).where(
                    Transaction.batch_id == batch_id,
                    Transaction.category_id.is_(None),
                    Transaction.ignored.is_(False),
                )
            )
        )
        if llm is not None:
            by_name, examples = llm_context(session)
            for i in range(0, len(pending), LLM_BATCH_SIZE):
                chunk = pending[i : i + LLM_BATCH_SIZE]
                classify_chunk(session, chunk, llm, by_name, examples)
                session.commit()  # progresso real e à prova de queda
        JOBS[batch_id] = "done"
    except Exception:
        logging.getLogger(__name__).exception(
            "Classificação em background falhou (batch %s)", batch_id
        )
        session.rollback()
        JOBS[batch_id] = "error"
    finally:
        session.close()


def job_status(session, batch_id: int) -> dict:
    rows = session.execute(
        select(Transaction.source, Transaction.category_id, Transaction.ignored).where(
            Transaction.batch_id == batch_id
        )
    ).all()
    active = [r for r in rows if not r.ignored]
    counts = {
        "regra": sum(1 for r in active if r.category_id and r.source == "regra"),
        "llm": sum(1 for r in active if r.category_id and r.source == "llm"),
        "pendente": sum(1 for r in active if r.category_id is None),
    }
    status = JOBS.get(batch_id)
    if status is None:
        status = "interrupted" if counts["pendente"] else "done"
    return {
        "status": status,
        "total": len(active),
        "done": counts["regra"] + counts["llm"],
        "counts": counts,
    }
```

Nota: o chunking usa o `LLM_BATCH_SIZE` importado no módulo (permite
monkeypatch de `classify_job.LLM_BATCH_SIZE` nos testes).

- [ ] **Step 5: Update the router**

Em `backend/app/routers/imports.py`, substituir imports e `create_import`:

```python
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from sqlalchemy import select

from app.db import get_session
from app.models import Account, ImportBatch, Transaction
from app.services.classifier import apply_rules, classify_new
from app.services.classify_job import JOBS, job_status, run_classification
from app.services.importer import import_file, undo_batch
from app.services.llm import get_llm

router = APIRouter(prefix="/api")


@router.post("/imports")
def create_import(
    background_tasks: BackgroundTasks,
    account_id: int = Form(...),
    file: UploadFile = File(...),
    session=Depends(get_session),
):
    if not session.get(Account, account_id):
        raise HTTPException(404, "Conta não encontrada")
    if not file.filename:
        raise HTTPException(400, "Arquivo sem nome")
    content = file.file.read()
    try:
        batch, new = import_file(session, account_id, file.filename, content)
    except ValueError as e:
        session.rollback()
        raise HTTPException(400, str(e))
    _, pending = apply_rules(session, new)
    session.commit()
    if pending and get_llm(session) is not None:
        JOBS[batch.id] = "running"
        background_tasks.add_task(run_classification, batch.id)
    else:
        JOBS[batch.id] = "done"
    return {
        "batch_id": batch.id,
        "filename": batch.filename,
        "new_count": batch.new_count,
        "dup_count": batch.dup_count,
        "classification": job_status(session, batch.id),
    }


@router.get("/imports/{batch_id}/classification")
def get_classification(batch_id: int, session=Depends(get_session)):
    if not session.get(ImportBatch, batch_id):
        raise HTTPException(404, "Lote não encontrado")
    return job_status(session, batch_id)
```

Os endpoints `list_imports`, `delete_import` e `classify_pending` permanecem
como estão (o `classify_pending` continua usando `classify_new`).

- [ ] **Step 6: Add client timeout in `llm.py`**

Em `backend/app/services/llm.py`, no `AnthropicLLM.__init__`, substituir:

```python
        self.client = anthropic.Anthropic(api_key=api_key)
```

por:

```python
        # Sem timeout o SDK espera até ~10min por chamada; LLM é acessório,
        # falha rápida e sem cascata de retries.
        self.client = anthropic.Anthropic(api_key=api_key, timeout=120.0, max_retries=1)
```

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && .venv/bin/pytest`
Expected: tudo verde (81 anteriores ajustados + ~8 novos). Atenção: se
`test_import_endpoint_returns_summary` falhar por causa de `classification`,
o shape da resposta divergiu do spec — corrigir a implementação.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/classifier.py backend/app/services/classify_job.py \
  backend/app/routers/imports.py backend/app/services/llm.py \
  backend/tests/conftest.py backend/tests/test_api_import_dashboard.py \
  backend/tests/test_classify_job.py
git commit -m "feat(import): background LLM classification with progress endpoint"
```

---

### Task 2: Frontend — polling de progresso na tela de Imports

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/hooks.ts`
- Create: `frontend/src/components/ClassificationStatus.tsx`
- Create: `frontend/src/components/ClassificationStatus.test.ts`
- Modify: `frontend/src/pages/Imports.tsx`

- [ ] **Step 1: Write the failing test**

Criar `frontend/src/components/ClassificationStatus.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { describeProgress } from "./ClassificationStatus";
import type { ClassificationProgress } from "../api/types";

const base = { total: 10, done: 4, counts: { regra: 1, llm: 3, pendente: 6 } };

describe("describeProgress", () => {
  it("running mostra X/Y", () => {
    const p: ClassificationProgress = { ...base, status: "running" };
    expect(describeProgress(p)).toBe("classificando 4/10…");
  });

  it("done mostra contagens finais", () => {
    const p: ClassificationProgress = { ...base, status: "done" };
    expect(describeProgress(p)).toBe(
      "classificadas: 1 por regra, 3 pelo LLM, 6 pendentes"
    );
  });

  it("interrupted e error apontam para reclassificar", () => {
    expect(
      describeProgress({ ...base, status: "interrupted" })
    ).toContain("Reclassificar pendentes");
    expect(describeProgress({ ...base, status: "error" })).toContain(
      "Reclassificar pendentes"
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- --run`
Expected: FAIL (módulo `./ClassificationStatus` não existe)

- [ ] **Step 3: Update types**

Em `frontend/src/api/types.ts`, substituir a interface `ImportResult` por:

```ts
export interface ClassificationProgress {
  status: "running" | "done" | "error" | "interrupted";
  total: number;
  done: number;
  counts: ClassifiedCounts;
}

export interface ImportResult {
  batch_id: number;
  filename: string;
  new_count: number;
  dup_count: number;
  classification: ClassificationProgress;
}
```

- [ ] **Step 4: Add the polling hook**

Em `frontend/src/api/hooks.ts`, adicionar `ClassificationProgress` ao import
de tipos e, junto aos hooks de query (após `useImports`):

```ts
export const useClassification = (
  batchId: number,
  initial: ClassificationProgress
) =>
  useQuery({
    queryKey: ["classification", batchId],
    queryFn: () =>
      api<ClassificationProgress>(`/imports/${batchId}/classification`),
    initialData: initial,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 1500 : false,
  });
```

- [ ] **Step 5: Create the component**

Criar `frontend/src/components/ClassificationStatus.tsx`:

```tsx
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useClassification } from "../api/hooks";
import type { ClassificationProgress } from "../api/types";

export function describeProgress(p: ClassificationProgress): string {
  if (p.status === "running") return `classificando ${p.done}/${p.total}…`;
  if (p.status === "error")
    return 'classificação falhou — use "Reclassificar pendentes"';
  if (p.status === "interrupted")
    return 'classificação interrompida — use "Reclassificar pendentes"';
  return `classificadas: ${p.counts.regra} por regra, ${p.counts.llm} pelo LLM, ${p.counts.pendente} pendentes`;
}

export default function ClassificationStatus({
  batchId,
  initial,
}: {
  batchId: number;
  initial: ClassificationProgress;
}) {
  const { data } = useClassification(batchId, initial);
  const queryClient = useQueryClient();
  const status = data.status;
  useEffect(() => {
    // terminou (ou falhou): dashboard/transações precisam refletir as categorias
    if (status !== "running") {
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== "classification",
      });
    }
  }, [status, queryClient]);
  return <span>{describeProgress(data)}</span>;
}
```

(Com `initialData`, `data` nunca é `undefined` — o TanStack Query tipa como
`ClassificationProgress` direto.)

- [ ] **Step 6: Use it in Imports.tsx**

Em `frontend/src/pages/Imports.tsx`:

1. Adicionar import: `import ClassificationStatus from "../components/ClassificationStatus";`
2. Substituir o bloco `results.map` por:

```tsx
        {results.map((r) => (
          <p key={r.batch_id} className="muted">
            <b>{r.filename}</b>: {r.new_count} novas, {r.dup_count} duplicadas ·{" "}
            <ClassificationStatus batchId={r.batch_id} initial={r.classification} />
          </p>
        ))}
```

- [ ] **Step 7: Test and typecheck**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: testes verdes (10 existentes + 3 novos) e build sem erros de tipo.
Se `npm run build` acusar uso remanescente de `classified`, procurar com
`grep -rn "classified" src/` e ajustar.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/hooks.ts \
  frontend/src/components/ClassificationStatus.tsx \
  frontend/src/components/ClassificationStatus.test.ts \
  frontend/src/pages/Imports.tsx
git commit -m "feat(ui): live classification progress on imports page"
```

---

### Task 3: Verificação de ponta a ponta com o servidor real

**Files:** nenhum; validação manual. Pré-requisito: `backend/.env` com
`ANTHROPIC_API_KEY`; arquivo real em
`/mnt/c/Users/mathe/Downloads/Bradesco_872026_122833 AM.csv`.

- [ ] **Step 1: Rebuild do frontend e restart do servidor**

```bash
cd frontend && npm run build
# reiniciar o uvicorn (kill do processo atual + ./run.sh em background)
```

- [ ] **Step 2: Desfazer o batch 4 e reimportar com cronômetro**

```bash
curl -s -X DELETE http://127.0.0.1:8000/api/imports/4 -o /dev/null -w "undo: %{http_code}\n"
time curl -s -X POST -F "account_id=2" \
  -F "file=@/mnt/c/Users/mathe/Downloads/Bradesco_872026_122833 AM.csv" \
  http://127.0.0.1:8000/api/imports
```

Expected: POST responde em **~1s** com `"classification": {"status": "running", "total": 141, "done": 0, ...}`.

- [ ] **Step 3: Durante a classificação, provar que o app não congela e o progresso avança**

```bash
for i in 1 2 3 4 5 6 7 8; do
  sleep 8
  curl -s -m 2 -o /dev/null -w "accounts: %{http_code} em %{time_total}s | " http://127.0.0.1:8000/api/accounts
  curl -s http://127.0.0.1:8000/api/imports/5/classification
  echo
done
```

Expected: `accounts: 200` sempre em <0,1s (sem congelamento) e `done`
crescendo (0 → 50 → 100 → 141) até `"status": "done"`. Se accounts der
timeout, o event loop segue bloqueado — investigar antes de prosseguir.

- [ ] **Step 4: Suíte completa de sanidade**

Run: `cd backend && .venv/bin/pytest -q` e `cd frontend && npm test -- --run`
Expected: tudo verde.
