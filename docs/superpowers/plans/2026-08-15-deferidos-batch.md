# Lote de Deferidos (A/B/C/D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Liquidar o backlog de deferidos das revisões (base `c9a8afd`): 3 bugs visíveis (A1–A3; A4 foi cortado), 4 itens de robustez (B5–B8), 6 cleanups (C9–C14) e os testes pendentes (D15–D16).

**Architecture:** Sem features novas — cada task é um conserto pontual em módulo existente. Frontend: libs puras em `frontend/src/lib/` testadas com vitest, componentes verificados visualmente. Backend: FastAPI + SQLAlchemy, pytest. Spec do A1: `docs/superpowers/specs/2026-08-15-transactions-summary-kind-design.md`.

**Tech Stack:** React 18 + TypeScript + vitest (frontend), FastAPI + SQLite + pytest (backend).

**Regras da sessão (inegociáveis):**
- Comandos de teste: frontend `cd frontend && npm test`; backend `cd backend && .venv/bin/python -m pytest -q`. Testes que sobem servidor NUNCA na porta 8000 (o app real roda lá).
- Commits pequenos, mensagem convencional, **sem** co-autoria de AI.
- `npm run build` (em `frontend/`) ao final de cada lote (A, B, C, D) — o usuário vê o app pelo build estático em `frontend/dist`.
- Uma única revisão de código ao final do plano inteiro (preferência do usuário).
- Escritas de verificação no banco real sempre revertidas.
- Regra do projeto: valor negativo é sempre tom `--over`; `pctOf` satura (largura de barra), texto usa `pctRaw`.

---

## Lote A — bugs visíveis

### Task 1: A1 — `summarize` ciente de kind + strip com 4 colunas

Segue a spec `docs/superpowers/specs/2026-08-15-transactions-summary-kind-design.md`.

**Files:**
- Modify: `frontend/src/lib/txTable.ts:1-26`
- Modify: `frontend/src/lib/txTable.test.ts:31-57`
- Modify: `frontend/src/pages/Transactions.tsx:49-65`
- Modify: `frontend/src/components/transactions/TotalsStrip.tsx`
- Modify: `frontend/src/styles/pages.css:815` (`.tx-totals` de 3 para 4 colunas)

- [ ] **Step 1: Escrever os testes que falham**

Em `frontend/src/lib/txTable.test.ts`, substituir o bloco `describe("summarize", ...)` inteiro por (os dois testes existentes ganham o novo argumento e o campo `investido`; os quatro seguintes são novos):

```ts
describe("summarize", () => {
  const KINDS = new Map<number, CategoryKind>([
    [10, "saida"],
    [20, "saida"],
    [30, "investimento"],
    [40, "entrada"],
  ]);

  it("soma entradas, saídas e saldo, ignoradas fora", () => {
    const s = summarize(
      [
        tx({ id: 1, amount_cents: 850000, category_id: 40 }),
        tx({ id: 2, amount_cents: -30000, category_id: 10 }),
        tx({ id: 3, amount_cents: -20000, category_id: 20 }),
        tx({ id: 4, amount_cents: -99900, ignored: true }),
      ],
      KINDS
    );
    expect(s).toEqual({
      count: 3,
      entradas: 850000,
      saidas: 50000,
      investido: 0,
      saldo: 800000,
      temIgnoradas: true,
    });
  });

  it("lista vazia zera tudo", () => {
    expect(summarize([], KINDS)).toEqual({
      count: 0,
      entradas: 0,
      saidas: 0,
      investido: 0,
      saldo: 0,
      temIgnoradas: false,
    });
  });

  it("resgate de investimento não vira entrada (caso registrado)", () => {
    const s = summarize([tx({ id: 1, amount_cents: 5048, category_id: 30 })], KINDS);
    expect(s.entradas).toBe(0);
    expect(s.investido).toBe(-5048); // resgate líquido
    expect(s.saldo).toBe(5048); // variação de caixa preservada
  });

  it("aporte é investido positivo e sai do saldo", () => {
    const s = summarize(
      [
        tx({ id: 1, amount_cents: 850000, category_id: 40 }),
        tx({ id: 2, amount_cents: -200000, category_id: 30 }),
      ],
      KINDS
    );
    expect(s).toMatchObject({ entradas: 850000, investido: 200000, saldo: 650000 });
  });

  it("estorno em categoria de entrada reduz entradas, como no backend", () => {
    const s = summarize(
      [
        tx({ id: 1, amount_cents: 850000, category_id: 40 }),
        tx({ id: 2, amount_cents: -10000, category_id: 40 }),
      ],
      KINDS
    );
    expect(s.entradas).toBe(840000);
    expect(s.saidas).toBe(0);
  });

  it("sem categoria e id desconhecido caem por sinal (uncat_in/uncat_out)", () => {
    const s = summarize(
      [
        tx({ id: 1, amount_cents: 5000, category_id: null }),
        tx({ id: 2, amount_cents: -3000, category_id: 999 }),
      ],
      KINDS
    );
    expect(s).toMatchObject({ entradas: 5000, saidas: 3000, investido: 0 });
  });
});
```

E no topo do arquivo, incluir `CategoryKind` no import de tipos:

```ts
import type { CategoryKind, Tx } from "../api/types";
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/txTable.test.ts`
Expected: FAIL — `summarize` não aceita segundo argumento / `investido` ausente.

- [ ] **Step 3: Implementar o novo `summarize`**

Em `frontend/src/lib/txTable.ts`, substituir o import de tipos, a interface e a função (linhas 1–26) por:

```ts
import type { CategoryKind, Tx } from "../api/types";

export interface TxSummary {
  count: number;
  entradas: number;
  saidas: number;
  investido: number;
  saldo: number;
  temIgnoradas: boolean;
}

/**
 * Espelha a semântica do backend (`month_summary`): entradas/saídas somam pelo
 * kind da categoria; investimento é o líquido com sinal (positivo = aportou);
 * sem categoria (ou id fora do mapa, ex.: categorias ainda carregando) cai por
 * sinal, como uncat_in/uncat_out. Saldo segue sendo a variação real de caixa.
 */
export function summarize(txs: Tx[], kindById: Map<number, CategoryKind>): TxSummary {
  let entradas = 0;
  let saidas = 0;
  let investido = 0;
  let count = 0;
  let temIgnoradas = false;
  for (const t of txs) {
    if (t.ignored) {
      temIgnoradas = true;
      continue;
    }
    count += 1;
    const kind = t.category_id === null ? undefined : kindById.get(t.category_id);
    if (kind === "entrada") entradas += t.amount_cents;
    else if (kind === "investimento") investido += -t.amount_cents;
    else if (kind === "saida") saidas += -t.amount_cents;
    else if (t.amount_cents > 0) entradas += t.amount_cents;
    else saidas += -t.amount_cents;
  }
  return {
    count,
    entradas,
    saidas,
    investido,
    saldo: entradas - saidas - investido,
    temIgnoradas,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/lib/txTable.test.ts`
Expected: PASS.

- [ ] **Step 5: Passar o mapa de kinds na tela**

Em `frontend/src/pages/Transactions.tsx`, dentro do componente (junto ao memo `lookups`, linha ~49), adicionar e usar:

```ts
const kindById = useMemo(
  () => new Map((categories ?? []).map((c) => [c.id, c.kind])),
  [categories]
);
```

E trocar a linha do `totais`:

```ts
const totais = useMemo(() => summarize(visiveis, kindById), [visiveis, kindById]);
```

- [ ] **Step 6: Quarta coluna no strip**

`frontend/src/components/transactions/TotalsStrip.tsx` vira:

```tsx
import type { TxSummary } from "../../lib/txTable";
import Money from "../Money";

export default function TotalsStrip({ s }: { s: TxSummary }) {
  return (
    <section className="tx-totals">
      <div>
        <span className="label">Entradas</span>
        <Money cents={s.entradas} tone="accent" />
      </div>
      <div>
        <span className="label">Saídas</span>
        <Money cents={-s.saidas} />
      </div>
      <div>
        <span className="label">Investido</span>
        <Money cents={s.investido} tone={s.investido < 0 ? "over" : undefined} zeroDash />
      </div>
      <div>
        <span className="label">Saldo</span>
        <Money cents={s.saldo} tone={s.saldo < 0 ? "over" : "accent"} />
      </div>
    </section>
  );
}
```

Em `frontend/src/styles/pages.css` linha ~815, trocar:

```css
  grid-template-columns: repeat(3, 1fr);
```

por:

```css
  grid-template-columns: repeat(4, 1fr);
```

- [ ] **Step 7: Rodar a suíte inteira e o typecheck**

Run: `cd frontend && npm test && npx tsc -b`
Expected: 145+ testes PASS, typecheck limpo (se outro call-site de `summarize` aparecer no erro do tsc, atualizá-lo com o mapa).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/txTable.ts frontend/src/lib/txTable.test.ts frontend/src/pages/Transactions.tsx frontend/src/components/transactions/TotalsStrip.tsx frontend/src/styles/pages.css
git commit -m "fix(transactions): summary counts by category kind like the backend"
```

---

### Task 2: A2 + B5 — polling resiliente e invalidação única no ResultCard

Três defeitos do mesmo circuito: (1) uma falha de rede transiente congela o polling em "classificando…" para sempre e perde a invalidação final; (2) desfazer o lote deixa o polling batendo num 404; (3) montar o ResultCard com classificação já terminada dispara uma onda de invalidations redundante.

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/lib/imports.ts` (+ helper `pollInterval`)
- Modify: `frontend/src/lib/imports.test.ts`
- Modify: `frontend/src/api/hooks.ts:83-94`
- Modify: `frontend/src/components/imports/ResultCard.tsx:22-32`

- [ ] **Step 1: Testes do helper de polling (falham: não existe)**

Em `frontend/src/lib/imports.test.ts`, adicionar:

```ts
import { ApiError } from "../api/client";
import { pollInterval } from "./imports";

describe("pollInterval", () => {
  it("continua a 1500ms enquanto roda, sem erro", () => {
    expect(pollInterval("running", null)).toBe(1500);
  });

  it("erro transiente (rede, 5xx) NÃO para o polling", () => {
    expect(pollInterval("running", new TypeError("failed to fetch"))).toBe(1500);
    expect(pollInterval("running", new ApiError("boom", 500))).toBe(1500);
  });

  it("404 para: o lote foi desfeito e não volta", () => {
    expect(pollInterval("running", new ApiError("Lote não encontrado", 404))).toBe(false);
  });

  it("terminou (done/error/interrupted) para", () => {
    expect(pollInterval("done", null)).toBe(false);
    expect(pollInterval("error", null)).toBe(false);
    expect(pollInterval(undefined, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/imports.test.ts`
Expected: FAIL — `ApiError`/`pollInterval` não existem.

- [ ] **Step 3: `ApiError` no client**

`frontend/src/api/client.ts` — trocar o `throw new Error(detail)` e exportar a classe:

```ts
/** Erro HTTP da API com o status preservado — quem trata decide pelo código. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, init);
  if (!r.ok) {
    let detail = r.statusText;
    try {
      detail = (await r.json()).detail ?? detail;
    } catch {
      /* corpo não-JSON */
    }
    throw new ApiError(detail, r.status);
  }
  return r.status === 204 ? (undefined as T) : r.json();
}
```

(`jsonBody` fica como está.)

- [ ] **Step 4: `pollInterval` em lib/imports.ts**

Adicionar em `frontend/src/lib/imports.ts`:

```ts
import { ApiError } from "../api/client";

/**
 * Cadência do polling de classificação. Erro transiente (rede, 5xx) NÃO para —
 * parar congelaria o card em "classificando…" e perderia a invalidação final.
 * 404 para de vez: o lote foi desfeito e não volta.
 */
export function pollInterval(status: string | undefined, error: unknown): number | false {
  if (error instanceof ApiError && error.status === 404) return false;
  return status === "running" ? 1500 : false;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/lib/imports.test.ts`
Expected: PASS.

- [ ] **Step 6: Usar no hook**

Em `frontend/src/api/hooks.ts`, no `useClassification`, trocar o `refetchInterval` por:

```ts
refetchInterval: (query) => pollInterval(query.state.data?.status, query.state.error),
```

com `import { pollInterval } from "../lib/imports";` no topo.

- [ ] **Step 7: Invalidação só na transição running→terminal**

Em `frontend/src/components/imports/ResultCard.tsx`, trocar o bloco do `useEffect` (linhas 24–32) por:

```tsx
// Invalida UMA vez, na transição rodando→terminou. Montar um card cuja
// classificação já acabou não pode disparar refetch de tudo de novo.
const estavaRodando = useRef(status === "running");
useEffect(() => {
  if (estavaRodando.current && status !== "running") {
    estavaRodando.current = false;
    queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] !== "classification",
    });
  }
}, [status, queryClient]);
```

e ajustar o import do React: `import { useEffect, useRef } from "react";`

- [ ] **Step 8: Suíte inteira + typecheck**

Run: `cd frontend && npm test && npx tsc -b`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/hooks.ts frontend/src/lib/imports.ts frontend/src/lib/imports.test.ts frontend/src/components/imports/ResultCard.tsx
git commit -m "fix(imports): classification polling survives transient errors, stops on 404, invalidates once"
```

---

### Task 3: A3 — orçamento negativo (planejar resgate)

A nota da UI diz "negativo é resgate", mas `BudgetInput` rejeita (`parsed >= 0`) e o backend também (`Field(ge=0)`).

**Files:**
- Modify: `backend/app/schemas.py:28-31`
- Modify: `backend/app/models.py:75`
- Modify: `backend/tests/test_api_budgets_copy.py` (mesmo arquivo dos helpers `put`/`get_map`)
- Modify: `frontend/src/components/BudgetInput.tsx:21-24`

- [ ] **Step 1: Teste backend que falha**

Em `backend/tests/test_api_budgets_copy.py`, adicionar:

```python
def test_put_budget_accepts_negative_planned_resgate(client, session):
    """Negativo em categoria de investimento = resgate planejado."""
    from app.models import Category
    from sqlalchemy import select

    invest = session.scalar(select(Category).where(Category.name == "Investimentos"))
    put(client, invest.id, -50000, "2026-09")
    assert get_map(client, "2026-09")[invest.id] == -50000
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_api_budgets_copy.py -q`
Expected: FAIL — 422 do Pydantic (`ge=0`), o helper `put` estoura no `assert r.status_code == 200`.

- [ ] **Step 3: Liberar no backend**

`backend/app/schemas.py` — trocar:

```python
class BudgetPut(BaseModel):
    category_id: int
    amount_cents: int  # negativo = resgate planejado (kind investimento)
    valid_from: str  # "YYYY-MM"
```

Se `Field` ficar sem uso no arquivo, remover do import (`from pydantic import BaseModel`).

`backend/app/models.py` linha 75 — atualizar o comentário do `Budget.amount_cents`:

```python
    amount_cents: Mapped[int]  # negativo = resgate planejado; sinal por kind da categoria
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: PASS (suíte inteira — o `month_summary` soma orçados com sinal, nada mais muda).

- [ ] **Step 5: Liberar no frontend**

`frontend/src/components/BudgetInput.tsx`, no `commit` (linha 23), trocar:

```ts
    if (parsed !== null && parsed !== cents) onSave(parsed);
```

(`parseBRL` já aceita `-`; `toText` formata negativo corretamente.)

- [ ] **Step 6: Testes frontend**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas.py backend/app/models.py backend/tests/test_api_budgets_copy.py frontend/src/components/BudgetInput.tsx
git commit -m "fix(budget): accept negative amounts to plan investment resgates"
```

---

### Task 4: Fechamento do lote A — build + verificação visual

- [ ] **Step 1: Build**

Run: `cd frontend && npm run build`
Expected: build limpo em `frontend/dist`.

- [ ] **Step 2: Verificação Playwright (skill webapp-testing)**

Verificar em `http://localhost:8000` (o uvicorn do usuário serve `frontend/dist` direto do disco — o build novo aparece sem restart; NUNCA subir servidor próprio nessa porta). Somente leitura, nenhuma escrita no banco. Conferir em Transações:
- strip com 4 colunas; mês com resgate real (o caso dos R$ 50,48) mostra Entradas R$ 0,00 e Investido −R$ 50,48 em `--over`;
- mês sem investimento mostra `—` na coluna Investido;
- dark e light.
Screenshot dos dois temas. Nenhuma escrita no banco.

- [ ] **Step 3: Commit (se houver ajuste visual)**

Ajustes de CSS que a verificação pedir entram num commit `fix(ui): ...` próprio.

---

## Lote B — robustez

### Task 5: B6 — `imported_at` com offset UTC explícito no contrato

O backend grava naive-UTC (CURRENT_TIMESTAMP do SQLite) e serializa sem offset; o frontend adivinha (`whenLabel` cola um "Z"). O contrato passa a ser explícito: a API emite offset.

**Files:**
- Modify: `backend/app/routers/imports.py:62-72`
- Modify: `backend/tests/test_api_import_dashboard.py`
- Modify: `frontend/src/lib/imports.ts:18-27` (só o comentário)

- [ ] **Step 1: Teste backend que falha**

Em `backend/tests/test_api_import_dashboard.py`, adicionar (usar o padrão de upload já existente no arquivo para criar um lote; se houver helper de import, reusar):

```python
def test_list_imports_emits_utc_offset(client):
    csv = "Data;Histórico;Valor\n01/07/2026;LOJA A;-10,00\n".encode()
    r = client.post(
        "/api/imports",
        data={"account_id": "1"},
        files={"file": ("t.csv", csv, "text/csv")},
    )
    assert r.status_code == 200
    batches = client.get("/api/imports").json()
    assert batches[0]["imported_at"].endswith("+00:00")
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_api_import_dashboard.py -q`
Expected: FAIL — string sem offset.

- [ ] **Step 3: Implementar**

Em `backend/app/routers/imports.py`, no `list_imports`, trocar a linha do `imported_at` por:

```python
            "imported_at": b.imported_at.replace(tzinfo=timezone.utc).isoformat(),
```

com `from datetime import timezone` no topo do arquivo.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: PASS.

- [ ] **Step 5: Atualizar o comentário do whenLabel**

Em `frontend/src/lib/imports.ts`, trocar o docstring do `whenLabel` por:

```ts
/**
 * "2026-08-07T15:27:33+00:00" → "07/08 12:27" (fuso local), para a coluna Quando.
 * O backend emite `imported_at` com offset UTC explícito; o fallback de colar um
 * "Z" cobre strings naive de versões antigas da API.
 */
```

(A lógica não muda — o regex já aceita `+00:00`.)

- [ ] **Step 6: Testes frontend**

Run: `cd frontend && npm test`
Expected: PASS (os testes de `whenLabel` cobrem os dois formatos).

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/imports.py backend/tests/test_api_import_dashboard.py frontend/src/lib/imports.ts
git commit -m "fix(imports): emit imported_at with explicit UTC offset"
```

---

### Task 6: B7 — Tendências: linha não pula ao salvar orçamento do mês atual

As saídas são ordenadas por desvio; salvar um orçamento muda o desvio e re-ordena sob o cursor. A ordem é congelada no primeiro render e só re-rankeia quando o usuário troca a janela (3m/6m) — momento deliberado de "reler".

**Files:**
- Modify: `frontend/src/lib/trends.ts` (+ `applyOrder`)
- Modify: `frontend/src/lib/trends.test.ts`
- Modify: `frontend/src/pages/Trends.tsx`

- [ ] **Step 1: Testes que falham**

Em `frontend/src/lib/trends.test.ts`, adicionar (usar o factory de `TrendsRow` do arquivo se existir; senão construir objetos mínimos com cast):

```ts
import { applyOrder, type TrendsRow } from "./trends";

const row = (id: number) => ({ id }) as TrendsRow;

describe("applyOrder", () => {
  it("reordena pela lista de ids congelada", () => {
    expect(applyOrder([row(3), row(1), row(2)], [1, 2, 3]).map((r) => r.id)).toEqual([
      1, 2, 3,
    ]);
  });

  it("ids fora da lista (categoria nova) vão para o fim, na ordem em que vieram", () => {
    expect(applyOrder([row(9), row(1), row(8)], [1]).map((r) => r.id)).toEqual([1, 9, 8]);
  });

  it("não muta o array original", () => {
    const rows = [row(2), row(1)];
    applyOrder(rows, [1, 2]);
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/trends.test.ts`
Expected: FAIL — `applyOrder` não existe.

- [ ] **Step 3: Implementar `applyOrder`**

Em `frontend/src/lib/trends.ts`, adicionar ao final:

```ts
/**
 * Congela a ordem das linhas enquanto o usuário edita: reordena `rows` pela
 * lista de ids capturada no primeiro render. Sem isso, salvar o orçamento do
 * mês atual re-ordena as saídas por desvio e a linha pula sob o cursor. Ids
 * fora da lista (categoria recém-criada) vão para o fim, na ordem natural
 * (sort estável).
 */
export function applyOrder(rows: TrendsRow[], order: number[]): TrendsRow[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return [...rows].sort(
    (a, b) => (pos.get(a.id) ?? order.length) - (pos.get(b.id) ?? order.length)
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/lib/trends.test.ts`
Expected: PASS.

- [ ] **Step 5: Congelar na página**

Em `frontend/src/pages/Trends.tsx`:

```ts
import { useRef, useState } from "react";
// ...
import { applyOrder, buildTrends, trendsStrip, trendsWindow } from "../lib/trends";
```

Dentro do componente, após os hooks existentes:

```ts
const saidaOrder = useRef<number[] | null>(null);
```

No `Segmented` do header, resetar o congelamento ao trocar a janela — trocar `onChange={setSpan}` por:

```tsx
onChange={(v) => {
  saidaOrder.current = null; // trocar a janela é momento deliberado de re-rankear
  setSpan(v);
}}
```

E logo após `const m = buildTrends(...)`:

```ts
if (saidaOrder.current === null) saidaOrder.current = m.rows.saida.map((r) => r.id);
m.rows.saida = applyOrder(m.rows.saida, saidaOrder.current);
```

- [ ] **Step 6: Suíte + typecheck**

Run: `cd frontend && npm test && npx tsc -b`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/trends.ts frontend/src/lib/trends.test.ts frontend/src/pages/Trends.tsx
git commit -m "fix(trends): freeze expense row order while editing budgets"
```

---

### Task 7: B8 — N+1 no budget-copy + poda do dict JOBS

**Files:**
- Modify: `backend/app/routers/budgets.py:52-80`
- Modify: `backend/app/services/classify_job.py`
- Modify: `backend/app/routers/imports.py:41-45`
- Modify: `backend/tests/test_classify_job.py`

- [ ] **Step 1: Teste da poda (falha: não existe)**

Em `backend/tests/test_classify_job.py`, adicionar:

```python
def test_prune_jobs_keeps_recent_and_running():
    from app.services.classify_job import MAX_JOBS, prune_jobs

    JOBS.clear()
    for i in range(30):
        JOBS[i] = "done"
    JOBS[99] = "running"
    prune_jobs()
    assert len(JOBS) == MAX_JOBS
    assert 99 in JOBS  # nunca poda job em execução
    assert 0 not in JOBS and 29 in JOBS  # caem os mais antigos
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_classify_job.py -q`
Expected: FAIL — `prune_jobs` não existe.

- [ ] **Step 3: Implementar a poda**

Em `backend/app/services/classify_job.py`, após a definição de `JOBS`:

```python
MAX_JOBS = 20


def prune_jobs() -> None:
    """Poda os jobs terminados mais antigos; o dict viveria para sempre sem isso."""
    finished = [k for k, v in JOBS.items() if v != "running"]
    for k in finished[: max(0, len(JOBS) - MAX_JOBS)]:
        del JOBS[k]
```

Em `run_classification`, no `finally`, antes do `session.close()`:

```python
    finally:
        prune_jobs()
        session.close()
```

Em `backend/app/routers/imports.py`, no `create_import`, após o `if pending ... else` que grava `JOBS[batch.id]`, acrescentar uma linha:

```python
    prune_jobs()
```

com o import ajustado: `from app.services.classify_job import JOBS, job_status, prune_jobs, run_classification`.

- [ ] **Step 4: N+1 do copy**

Em `backend/app/routers/budgets.py`, no `copy_budget`, trocar o loop por (uma query para os destinos existentes, em vez de uma por categoria):

```python
    bmap = budget_map(session, payload.from_month)
    existentes = {
        b.category_id: b
        for b in session.scalars(
            select(Budget).where(Budget.valid_from == payload.to_month)
        )
    }
    copied = 0
    for cat in session.scalars(select(Category).where(~Category.archived)):
        cents = bmap.get(cat.id, 0)
        existing = existentes.get(cat.id)
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

- [ ] **Step 5: Rodar tudo e ver passar**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: PASS — os testes de copy existentes cobrem o comportamento; só a forma da query mudou.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/budgets.py backend/app/services/classify_job.py backend/app/routers/imports.py backend/tests/test_classify_job.py
git commit -m "perf(backend): batch budget-copy lookups and prune finished classification jobs"
```

---

### Task 8: Fechamento do lote B — build + restart

- [ ] **Step 1: Build e testes finais do lote**

Run: `cd frontend && npm run build && npm test`; `cd backend && .venv/bin/python -m pytest -q`
Expected: tudo PASS, build limpo.

- [ ] **Step 2: Avisar sobre restart do uvicorn**

O lote B muda backend (rotas de imports/budgets). Anotar para o fechamento final: o usuário precisa reiniciar o `./run.sh` para ver B6/B8 — **não** reiniciar automaticamente sem checar com o usuário se o servidor está em uso.

---

## Lote C — cleanups

### Task 9: C9 — comparador pt-BR compartilhado

Cinco cópias de `localeCompare(..., "pt-BR", { sensitivity: "base" })` em 4 libs.

**Files:**
- Create: `frontend/src/lib/collate.ts`
- Create: `frontend/src/lib/collate.test.ts`
- Modify: `frontend/src/lib/txTable.ts:43-44`, `frontend/src/lib/budget.ts:30-31`, `frontend/src/lib/trends.ts:94-95`, `frontend/src/lib/settings.ts:3-4,47`

- [ ] **Step 1: Teste que falha**

`frontend/src/lib/collate.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { collatePt, porNome } from "./collate";

describe("collatePt", () => {
  it("ignora caixa e acento", () => {
    expect(collatePt("Água", "agua")).toBe(0);
    expect(["Étage", "abacaxi", "Zebra"].sort(collatePt)).toEqual([
      "abacaxi",
      "Étage",
      "Zebra",
    ]);
  });
});

describe("porNome", () => {
  it("ordena objetos pelo campo nome", () => {
    const rows = [{ nome: "Zebra" }, { nome: "água" }];
    expect([...rows].sort(porNome).map((r) => r.nome)).toEqual(["água", "Zebra"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/collate.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `collate.ts`**

```ts
/** Comparador pt-BR compartilhado: caixa- e acento-insensível. */
export const collatePt = (a: string, b: string) =>
  a.localeCompare(b, "pt-BR", { sensitivity: "base" });

/** Ordenação pelo campo `nome` — o shape das linhas de orçamento/tendências. */
export const porNome = (a: { nome: string }, b: { nome: string }) =>
  collatePt(a.nome, b.nome);
```

- [ ] **Step 4: Migrar os call-sites**

- `txTable.ts`: apagar `const collate = ...` (linhas 43–44), `import { collatePt } from "./collate";` e renomear os usos de `collate(` para `collatePt(` (5 ocorrências no `cmp`).
- `budget.ts`: apagar `const porNome = ...` (linhas 30–31), `import { porNome } from "./collate";`
- `trends.ts`: apagar `const porNome = ...` (linhas 94–95), `import { porNome } from "./collate";`
- `settings.ts`: apagar `const porNome = ...` (linhas 3–4) e criar wrapper local com o campo `name`:

```ts
import { collatePt } from "./collate";

const porName = (a: { name: string }, b: { name: string }) => collatePt(a.name, b.name);
```

(renomear os usos de `porNome` para `porName` nas linhas 27 e 48) e na linha 47 trocar o `localeCompare` inline por `collatePt(a, b)`.

- [ ] **Step 5: Suíte + typecheck**

Run: `cd frontend && npm test && npx tsc -b`
Expected: PASS — as suítes de budget/trends/settings/txTable já exercitam a ordenação.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/collate.ts frontend/src/lib/collate.test.ts frontend/src/lib/txTable.ts frontend/src/lib/budget.ts frontend/src/lib/trends.ts frontend/src/lib/settings.ts
git commit -m "refactor(frontend): shared pt-BR collator"
```

---

### Task 10: C10 — consolidar os overrides de margem do .card

**Desvio documentado do backlog:** o item pedia "mover o espaçamento para os containers" (tirar o `margin-bottom` do `.card` e dar `gap` a todo empilhamento). Isso exigiria auditar o fluxo vertical das 6 telas num app visualmente pronto — risco alto, ganho zero para o usuário. Em vez disso, os 4 overrides idênticos espalhados em `pages.css` viram **um** seletor agrupado colado na definição do `.card`, onde a exceção fica visível. A duplicação morre; o layout não muda um pixel.

**Files:**
- Modify: `frontend/src/styles/components.css:3-9`
- Modify: `frontend/src/styles/pages.css:709-711,1150-1152,1930-1932,2399-2401`

- [ ] **Step 1: Adicionar o seletor agrupado**

Em `components.css`, logo após o bloco `.card { ... }`:

```css
/* Grids e rails espaçam com o gap do container — o margin-bottom do .card duplicaria. */
.dash-col > .card:last-child,
.budget-rail .card,
.imp-grid .card,
.set-grid .card {
  margin-bottom: 0;
}
```

- [ ] **Step 2: Remover os 4 blocos de pages.css**

Apagar os quatro blocos (procurar por `margin-bottom: 0`):

```css
.dash-col > .card:last-child { margin-bottom: 0; }
.budget-rail .card { margin-bottom: 0; }
.imp-grid .card { margin-bottom: 0; }
.set-grid .card { margin-bottom: 0; }
```

(cada um está formatado em 3 linhas; remover o bloco inteiro.)

- [ ] **Step 3: Build + verificação visual rápida**

Run: `cd frontend && npm run build`
Expected: build limpo. Playwright: screenshot de Dashboard, Orçamento, Importar e Configurações — espaçamento idêntico ao anterior (as regras têm a mesma especificidade; a ordem components→pages não importa porque os blocos saíram de pages).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/components.css frontend/src/styles/pages.css
git commit -m "refactor(styles): consolidate card margin overrides next to .card"
```

---

### Task 11: C11 — extensões de importação numa fonte só

**Files:**
- Modify: `frontend/src/lib/imports.ts`
- Modify: `frontend/src/lib/imports.test.ts`
- Modify: `frontend/src/components/imports/UploadCard.tsx:10,63-66,114`

- [ ] **Step 1: Teste que falha**

Em `frontend/src/lib/imports.test.ts`:

```ts
import { IMPORT_ACCEPT, IMPORT_EXT_RE, IMPORT_EXTS } from "./imports";

describe("extensões de importação", () => {
  it("regex aceita as extensões sem case, rejeita o resto", () => {
    expect(IMPORT_EXT_RE.test("extrato.OFX")).toBe(true);
    expect(IMPORT_EXT_RE.test("fatura.csv")).toBe(true);
    expect(IMPORT_EXT_RE.test("nota.txt")).toBe(false);
    expect(IMPORT_EXT_RE.test("ofx")).toBe(false); // precisa do ponto
  });

  it("accept do input deriva da mesma lista", () => {
    expect(IMPORT_ACCEPT).toBe(IMPORT_EXTS.map((e) => `.${e}`).join(","));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/imports.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar em lib/imports.ts**

```ts
/** Única fonte das extensões aceitas — filtro de arquivos, accept do input e badges. */
export const IMPORT_EXTS = ["ofx", "csv"] as const;
export const IMPORT_EXT_RE = new RegExp(`\\.(${IMPORT_EXTS.join("|")})$`, "i");
export const IMPORT_ACCEPT = IMPORT_EXTS.map((e) => `.${e}`).join(",");
```

- [ ] **Step 4: Usar no UploadCard**

- Apagar `const EXT_OK = /\.(ofx|csv)$/i;` e usar `IMPORT_EXT_RE` no `addFiles`.
- Badges do header (linhas 63–66) viram:

```tsx
        <div className="imp-exts mono">
          {IMPORT_EXTS.map((e) => (
            <span key={e}>.{e.toUpperCase()}</span>
          ))}
        </div>
```

- `accept=".ofx,.csv"` vira `accept={IMPORT_ACCEPT}`.
- Import: `import { fileBadge, formatKB, IMPORT_ACCEPT, IMPORT_EXT_RE, IMPORT_EXTS } from "../../lib/imports";`

- [ ] **Step 5: Suíte + typecheck**

Run: `cd frontend && npm test && npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/imports.ts frontend/src/lib/imports.test.ts frontend/src/components/imports/UploadCard.tsx
git commit -m "refactor(imports): single source for accepted file extensions"
```

---

### Task 12: C12 — parser Bradesco: última coluna + `_decode` compartilhado

**Files:**
- Modify: `backend/app/parsers/csv_generic.py` (+ `_decode`)
- Modify: `backend/app/parsers/bradesco_fatura.py:12-17,63-64`
- Modify: `backend/tests/test_parsers_bradesco_fatura.py`

- [ ] **Step 1: Teste que falha (valor na última coluna não-vazia)**

Em `backend/tests/test_parsers_bradesco_fatura.py`, adicionar (uma linha com `;` final,
como o cabeçalho da fatura real, e uma com coluna intermediária a mais — o valor R$ é
sempre a última coluna não-vazia):

```python
def test_amount_comes_from_last_nonempty_column():
    fatura = (
        "Data: 07/08/2026\r"
        "Situação da Fatura: PAGO\r"
        "Data;Histórico;Valor(US$);Valor(R$);\r"
        "04/08;TRAILING ;0,00;10,00;\r"
        "05/08;EXTRA COL ;0,00;x;20,00\r"
    ).encode("latin-1")
    txs = parse_bradesco_fatura(fatura)
    by_desc = {t.description.strip(): t.amount_cents for t in txs}
    assert by_desc == {"TRAILING": -1000, "EXTRA COL": -2000}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_parsers_bradesco_fatura.py -q`
Expected: FAIL — com `parts[3]` fixo, `EXTRA COL` lê `"x"`, cai no `except ValueError` e a linha some do resultado.

- [ ] **Step 3: Implementar**

Em `backend/app/parsers/csv_generic.py`, adicionar após `_fold`:

```python
def _decode(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("latin-1")
```

e usar em `parse_csv` (trocar o try/except de decode das linhas 23–26 por `text = _decode(content)`).

Em `backend/app/parsers/bradesco_fatura.py`:
- apagar o `_decode` local (linhas 12–17) e importar: `from app.parsers.csv_generic import _decode, _fold, _to_cents`
- trocar as linhas do valor (63–64):

```python
        raw_valor = next((p for p in reversed(parts) if p.strip()), "")
        try:
            cents = -_to_cents(raw_valor)
```

(o guard `len(parts) < 4` fica — a linha precisa ter as colunas da fatura.)

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_parsers_bradesco_fatura.py tests/test_parsers_csv.py -q`
Expected: PASS (fixture real inclusa — o valor R$ é a última coluna não-vazia em todas as linhas).

- [ ] **Step 5: Commit**

```bash
git add backend/app/parsers/csv_generic.py backend/app/parsers/bradesco_fatura.py backend/tests/test_parsers_bradesco_fatura.py
git commit -m "refactor(parsers): bradesco amount from last column, shared _decode"
```

---

### Task 13: C13 — mensagem de kinds derivada de CATEGORY_KINDS

**Files:**
- Modify: `backend/app/routers/meta.py:60-61,75-76`

- [ ] **Step 1: Derivar a mensagem**

Em `backend/app/routers/meta.py`, após os imports:

```python
_KINDS_MSG = (
    "kind deve ser "
    + ", ".join(f"'{k}'" for k in CATEGORY_KINDS[:-1])
    + f" ou '{CATEGORY_KINDS[-1]}'"
)
```

e trocar as duas ocorrências de `raise HTTPException(400, "kind deve ser 'entrada', 'saida' ou 'investimento'")` por `raise HTTPException(400, _KINDS_MSG)`.

- [ ] **Step 2: Rodar e ver passar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_api_meta.py -q`
Expected: PASS — a string derivada é byte a byte igual à literal atual.

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/meta.py
git commit -m "refactor(meta): derive kind error message from CATEGORY_KINDS"
```

---

### Task 14: C14 — extrair `import_parsed()` (pré-requisito Pluggy)

**Files:**
- Modify: `backend/app/services/importer.py:27-64`
- Modify: `backend/tests/test_importer.py`

- [ ] **Step 1: Teste que falha**

Em `backend/tests/test_importer.py`, adicionar:

```python
def test_import_parsed_accepts_prebuilt_transactions(session):
    """Ponto de entrada do futuro conector Pluggy: transações já parseadas."""
    from datetime import date

    from app.parsers import ParsedTransaction
    from app.services.importer import import_parsed

    parsed = [
        ParsedTransaction(date=date(2026, 7, 1), description="LOJA A", amount_cents=-1000),
        ParsedTransaction(date=date(2026, 7, 2), description="LOJA B", amount_cents=-2000),
    ]
    batch, new = import_parsed(session, 1, "pluggy", "pluggy", parsed)
    session.commit()
    assert batch.new_count == 2 and batch.dup_count == 0
    assert len(new) == 2 and batch.source == "pluggy"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_importer.py -q`
Expected: FAIL — `import_parsed` não existe.

- [ ] **Step 3: Extrair a função**

Em `backend/app/services/importer.py`, `import_file` vira casca fina e o corpo migra:

```python
def import_file(
    session, account_id: int, filename: str, content: bytes
) -> tuple[ImportBatch, list[Transaction]]:
    parsed = parse_file(filename, content)  # ValueError => nada foi escrito
    source = "csv" if filename.lower().endswith(".csv") else "ofx"
    return import_parsed(session, account_id, filename, source, parsed)


def import_parsed(
    session, account_id: int, filename: str, source: str, parsed
) -> tuple[ImportBatch, list[Transaction]]:
    """Grava transações já parseadas — ponto de entrada de conectores (Pluggy)."""
    batch = ImportBatch(source=source, filename=filename)
    session.add(batch)
    session.flush()
    # daqui para baixo, mover as linhas 36-64 atuais de import_file SEM alteração:
    # ignore_matchers = ..., o loop `for p in parsed:` inteiro, o session.flush()
    # final e o `return batch, new`
```

- [ ] **Step 4: Rodar tudo e ver passar**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: PASS — `import_file` mantém contrato idêntico.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/importer.py backend/tests/test_importer.py
git commit -m "refactor(importer): extract import_parsed for future connectors"
```

---

### Task 15: Fechamento do lote C — build

- [ ] **Step 1: Build + suítes completas**

Run: `cd frontend && npm run build && npm test`; `cd backend && .venv/bin/python -m pytest -q`
Expected: tudo PASS.

---

## Lote D — só testes

### Task 16: D15 — testes de sort do txTable

**Files:**
- Modify: `frontend/src/lib/txTable.test.ts` (describe `sortTxs`)

- [ ] **Step 1: Adicionar os testes**

No `describe("sortTxs", ...)`:

```ts
  it("ordena por descrição", () => {
    const rows = [
      tx({ id: 1, description: "Zoo" }),
      tx({ id: 2, description: "água" }),
      tx({ id: 3, description: "Mercado" }),
    ];
    expect(sortTxs(rows, "description", "asc", LOOKUPS).map((t) => t.id)).toEqual([
      2, 3, 1,
    ]);
  });

  it("ordena por origem; origem nula vai para o fim nos dois sentidos", () => {
    const rows = [
      tx({ id: 1, source: null }),
      tx({ id: 2, source: "regra" }),
      tx({ id: 3, source: "llm" }),
    ];
    expect(sortTxs(rows, "source", "asc", LOOKUPS).map((t) => t.id)).toEqual([3, 2, 1]);
    expect(sortTxs(rows, "source", "desc", LOOKUPS).map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("categoria com id fora do lookup ordena como vazio: primeiro no asc, não no fim", () => {
    const rows = [tx({ id: 1, category_id: 999 }), tx({ id: 2, category_id: 10 })];
    expect(sortTxs(rows, "category", "asc", LOOKUPS).map((t) => t.id)).toEqual([1, 2]);
  });
```

- [ ] **Step 2: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/lib/txTable.test.ts`
Expected: PASS — comportamento já existente, agora coberto. (Se algum falhar, é bug real: parar e investigar com systematic-debugging antes de tocar no teste.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/txTable.test.ts
git commit -m "test(txtable): cover description/source sort and unknown category id"
```

---

### Task 17: D16 — testes backend pendentes

**Files:**
- Modify: `backend/tests/test_api_budgets_copy.py`
- Modify: `backend/tests/test_budget.py`
- Modify: `backend/tests/test_parsers_bradesco_fatura.py`
- Modify: `backend/tests/test_classify_job.py`

- [ ] **Step 1: Copy exclui arquivadas**

Em `test_api_budgets_copy.py`:

```python
def test_copy_ignores_archived_categories(client, session):
    from sqlalchemy import select

    from app.models import Category

    viagem = session.scalar(select(Category).where(Category.name == "Viagem"))
    viagem.archived = True
    session.flush()
    put(client, viagem.id, 100000, "2026-06")

    r = client.post(
        "/api/budgets/copy", json={"from_month": "2026-06", "to_month": "2026-08"}
    )
    assert r.status_code == 200
    rows = session.scalars(
        select(Budget).where(
            Budget.valid_from == "2026-08", Budget.category_id == viagem.id
        )
    ).all()
    assert rows == []
```

- [ ] **Step 2: Investimentos — múltiplas categorias e arquivada no líquido**

Em `test_budget.py`:

```python
def test_investimentos_soma_multiplas_categorias(session):
    invest = cat(session, "Investimentos")
    cripto = Category(name="Cripto", kind="investimento")
    session.add(cripto)
    session.flush()
    add_tx(session, invest.id, -100000)
    add_tx(session, cripto.id, -50000)
    s = month_summary(session, "2026-08", today=date(2026, 8, 15))
    assert s["investimentos"]["real"] == 150000
    nomes = {c["nome"] for c in s["categorias"] if c["kind"] == "investimento"}
    assert {"Investimentos", "Cripto"} <= nomes


def test_investimentos_arquivada_conta_no_liquido(session):
    invest = cat(session, "Investimentos")
    invest.archived = True
    session.flush()
    add_tx(session, invest.id, -100000)
    s = month_summary(session, "2026-08", today=date(2026, 8, 15))
    assert s["investimentos"]["real"] == 100000
    assert s["saldo"]["real"] == -100000  # o aporte da arquivada não some do caixa
```

- [ ] **Step 3: Bradesco — caminhos de skip silencioso**

Em `test_parsers_bradesco_fatura.py`:

```python
def _mini_fatura(*rows: str) -> bytes:
    return (
        "Data: 07/08/2026\r"
        "Situação da Fatura: PAGO\r"
        "Data;Histórico;Valor(US$);Valor(R$);\r" + "\r".join(rows) + "\r"
    ).encode("latin-1")


def test_skips_row_with_too_few_columns():
    txs = parse_bradesco_fatura(_mini_fatura("04/08;OK ;0,00;10,00", "04/08;CURTA;10,00"))
    assert [t.description.strip() for t in txs] == ["OK"]


def test_skips_row_with_impossible_date():
    txs = parse_bradesco_fatura(
        _mini_fatura("04/08;OK ;0,00;10,00", "30/02;IMPOSSIVEL ;0,00;10,00")
    )
    assert [t.description.strip() for t in txs] == ["OK"]


def test_skips_row_with_unparseable_amount():
    txs = parse_bradesco_fatura(
        _mini_fatura("04/08;OK ;0,00;10,00", "04/08;VALOR RUIM ;0,00;abc")
    )
    assert [t.description.strip() for t in txs] == ["OK"]
```

- [ ] **Step 4: Classificação — queda no meio preserva os lotes já commitados**

Em `test_classify_job.py`:

```python
def test_crash_mid_run_preserves_committed_chunks(session, monkeypatch):
    batch = _import_batch(session)

    class FlakyLLM:
        def __init__(self):
            self.calls = 0

        def classify(self, items, categories, examples=None):
            self.calls += 1
            if self.calls == 2:
                raise RuntimeError("caiu no 2º lote")
            return {item["id"]: categories[0] for item in items}

    monkeypatch.setattr(
        classify_job, "SessionLocal", sessionmaker(bind=session.get_bind())
    )
    monkeypatch.setattr(classify_job, "get_llm", lambda s: FlakyLLM())
    monkeypatch.setattr(classify_job, "LLM_BATCH_SIZE", 2)

    run_classification(batch.id)

    assert JOBS[batch.id] == "error"
    st = job_status(session, batch.id)
    assert st["counts"]["llm"] == 2  # 1º lote commitado antes da queda
    assert st["counts"]["pendente"] == 1
```

- [ ] **Step 5: Rodar tudo e ver passar**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: PASS. Qualquer FAIL aqui é bug real (são testes de comportamento existente) — investigar antes de ajustar o teste.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/test_api_budgets_copy.py backend/tests/test_budget.py backend/tests/test_parsers_bradesco_fatura.py backend/tests/test_classify_job.py
git commit -m "test(backend): cover deferred paths (copy/investments/bradesco skips/chunk commits)"
```

---

## Fechamento

### Task 18: Verificação final, revisão única e memória

- [ ] **Step 1: Suítes completas + build**

Run: `cd frontend && npm test && npm run build`; `cd backend && .venv/bin/python -m pytest -q`
Expected: tudo PASS (frontend ≥155, backend ≥118), build limpo.

- [ ] **Step 2: Revisão de código única do lote inteiro**

Usar superpowers:requesting-code-review sobre `c9a8afd..HEAD`. Aplicar o que for real; deferir o resto de volta ao backlog na memória.

- [ ] **Step 3: Verificação e2e leve (reversível)**

Com o build servido em 8000 (usuário reinicia o uvicorn antes, por causa do backend): strip de 4 colunas em Transações, orçamento negativo salvo e revertido em Tendências (escrever e desfazer), histórico de Importar com hora local correta. Toda escrita revertida.

- [ ] **Step 4: Atualizar a memória**

Em `deferidos-backlog.md`: marcar itens resolvidos, registrar o desvio documentado do C10. Em `project-status.md`: uma linha com o lote e o commit final.
