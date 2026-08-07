# Budget Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copiar o orçamento efetivo de um mês anterior para o mês visualizado na tela de Orçamento (dropdown + confirmação).

**Architecture:** `POST /api/budgets/copy` atômico no backend (snapshot exato via `budget_map`, upsert por categoria ativa) + dropdown "Copiar de…" no `Budget.tsx` com `useCopyBudget`.

**Tech Stack:** FastAPI/pytest, React/TanStack Query. Sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-08-07-budget-copy-design.md`

---

## File Structure

- Modify: `backend/app/schemas.py` — `BudgetCopy`
- Modify: `backend/app/routers/budgets.py` — endpoint copy
- Create: `backend/tests/test_api_budgets_copy.py`
- Modify: `frontend/src/api/hooks.ts` — `useCopyBudget`
- Modify: `frontend/src/pages/Budget.tsx` — dropdown

Contexto para o executor:

- Branch de trabalho: `feature/budget-copy` (criar a partir de `main` se não existir).
- Backend: `cd backend && .venv/bin/pytest` (hoje: 90 passed). Frontend:
  `cd frontend && npm test -- --run` (23) e `npm run build`.
- Semântica de `Budget`: `valid_from` "YYYY-MM", unique `(category_id,
  valid_from)`; `budget_map(session, month)` resolve o efetivo (valid_from
  mais recente ≤ month). Seed de testes (`conftest.session`) já cria
  categorias ativas (ids 1..N — descubra com `select(Category)`).
- O PUT existente em `app/routers/budgets.py:29-45` mostra o padrão de
  upsert e usa `require_month` de `app.routers.validators`.
- `lastNMonths`/`addMonths`/`monthLabel` em `frontend/src/lib/months.ts`;
  `useInvalidatingMutation` em `frontend/src/api/hooks.ts:93-99`.

---

### Task 1: Backend + frontend

**Files:** os cinco acima.

- [ ] **Step 1: Write the failing tests**

Criar `backend/tests/test_api_budgets_copy.py`:

```python
from sqlalchemy import func, select

from app.models import Budget


def put(client, category_id, cents, month):
    r = client.put(
        "/api/budgets",
        json={"category_id": category_id, "amount_cents": cents, "valid_from": month},
    )
    assert r.status_code == 200


def get_map(client, month):
    return {
        l["category_id"]: l["amount_cents"]
        for l in client.get("/api/budgets", params={"month": month}).json()
    }


def test_copy_snapshots_effective_values(client, session):
    # cat 1 definido em 2026-05 (herdado em jun), cat 2 definido em 2026-06
    put(client, 1, 100000, "2026-05")
    put(client, 2, 50000, "2026-06")
    # destino tem valor próprio que deve ser sobrescrito
    put(client, 1, 999999, "2026-08")

    r = client.post(
        "/api/budgets/copy", json={"from_month": "2026-06", "to_month": "2026-08"}
    )
    assert r.status_code == 200
    assert r.json()["copied"] >= 2

    m = get_map(client, "2026-08")
    assert m[1] == 100000  # herdado de maio via junho
    assert m[2] == 50000
    # categoria sem orçamento na origem zera no destino (snapshot exato)
    zeroed = [cid for cid, cents in m.items() if cents == 0]
    assert zeroed  # seed tem mais categorias ativas do que as 2 orçadas


def test_copy_twice_is_idempotent(client, session):
    put(client, 1, 100000, "2026-06")
    for _ in range(2):
        r = client.post(
            "/api/budgets/copy", json={"from_month": "2026-06", "to_month": "2026-08"}
        )
        assert r.status_code == 200
    rows = session.scalar(
        select(func.count()).select_from(Budget).where(Budget.valid_from == "2026-08")
    )
    copied = r.json()["copied"]
    assert rows == copied  # sem duplicatas (unique category_id+valid_from)


def test_copy_validates_months(client):
    assert (
        client.post(
            "/api/budgets/copy", json={"from_month": "2026-06", "to_month": "2026-06"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/budgets/copy", json={"from_month": "junho", "to_month": "2026-08"}
        ).status_code
        == 400
    )
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/pytest tests/test_api_budgets_copy.py -v`
Expected: FAIL — `405 Method Not Allowed` ou `404` (endpoint não existe).

- [ ] **Step 3: Schema + endpoint**

Em `backend/app/schemas.py`, logo após `BudgetPut`:

```python
class BudgetCopy(BaseModel):
    from_month: str  # "YYYY-MM"
    to_month: str
```

Em `backend/app/routers/budgets.py`: adicionar `BudgetCopy` ao import de
`app.schemas` e, ao final do arquivo:

```python
@router.post("/copy")
def copy_budget(payload: BudgetCopy, session=Depends(get_session)):
    require_month(payload.from_month, "from_month")
    require_month(payload.to_month, "to_month")
    if payload.from_month == payload.to_month:
        raise HTTPException(400, "Meses de origem e destino são iguais")
    bmap = budget_map(session, payload.from_month)
    copied = 0
    for cat in session.scalars(select(Category).where(~Category.archived)):
        cents = bmap.get(cat.id, 0)
        existing = session.scalar(
            select(Budget).where(
                Budget.category_id == cat.id,
                Budget.valid_from == payload.to_month,
            )
        )
        if existing:
            existing.amount_cents = cents
        else:
            session.add(
                Budget(
                    category_id=cat.id,
                    amount_cents=cents,
                    valid_from=payload.to_month,
                )
            )
        copied += 1
    session.commit()
    return {"copied": copied}
```

- [ ] **Step 4: Run backend suite**

Run: `cd backend && .venv/bin/pytest`
Expected: tudo verde (90 + 3 novos).

- [ ] **Step 5: Frontend hook + dropdown**

Em `frontend/src/api/hooks.ts`, junto das outras mutations:

```ts
export const useCopyBudget = () =>
  useInvalidatingMutation((payload: { from_month: string; to_month: string }) =>
    api("/budgets/copy", jsonBody("POST", payload))
  );
```

Em `frontend/src/pages/Budget.tsx`:

1. Imports: adicionar `useCopyBudget` ao import de hooks; adicionar
   `addMonths` e `lastNMonths` já vêm de `../lib/months` (conferir import
   existente — `lastNMonths` já é importado; acrescentar `addMonths`).
2. No componente, após `putBudget`:

```ts
  const copyBudget = useCopyBudget();
  const copyMonths = lastNMonths(addMonths(month, -1), 12).reverse();
```

3. No cabeçalho, trocar o bloco do `MonthPicker`:

```tsx
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Orçamento</h2>
        <div className="row">
          <select
            value=""
            disabled={copyBudget.isPending}
            onChange={(e) => {
              const from = e.target.value;
              if (!from) return;
              if (
                window.confirm(
                  `Substituir o orçamento de ${monthLabel(month)} pelo de ${monthLabel(from)}?`
                )
              )
                copyBudget.mutate({ from_month: from, to_month: month });
            }}
          >
            <option value="">Copiar de…</option>
            {copyMonths.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <MonthPicker month={month} onChange={setMonth} />
        </div>
      </div>
```

(Select com `value=""` fixo: volta ao placeholder após cada uso.)

- [ ] **Step 6: Test + typecheck**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: 23 testes verdes, build limpo.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas.py backend/app/routers/budgets.py \
  backend/tests/test_api_budgets_copy.py frontend/src/api/hooks.ts \
  frontend/src/pages/Budget.tsx
git commit -m "feat(budget): copy budget from another month"
```

---

### Task 2: Verificação visual (controlador)

- [ ] Rebuild do frontend, Playwright em `http://localhost:8000`: tela
  Orçamento → dropdown "Copiar de…" presente; escolher um mês com
  `page.on("dialog")` aceitando o confirm; valores da tabela mudam;
  screenshot. Cuidado: isso grava no banco real — copiar para um mês FUTURO
  distante (ex.: navegar para 2027-01 antes de copiar) e informar o usuário,
  ou aceitar a escrita se o destino for o mês corrente sem orçamento próprio.
