# Categoria de Investimentos (kind "investimento") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar o terceiro `kind` de categoria (`"investimento"`) para que aportes/resgates saiam de Entradas/Saídas e virem indicador de líquido (aportes − resgates) no dashboard e seção própria no orçamento, conforme `docs/superpowers/specs/2026-08-07-investimentos-category-design.md`.

**Architecture:** `Category.kind` ganha o valor `"investimento"` (coluna string — sem migração). `month_summary` agrega essas categorias num bloco `investimentos: {real, orcado}` com líquido **com sinal** e as exclui de entradas/saídas; `saldo` permanece numericamente idêntico (`entradas − saídas − líquido`). O bridge já trata qualquer kind ≠ "entrada" com sinal −1, então não muda (só ganha teste de regressão). Frontend: tile "Investido" no KpiRow, terceiro bloco no CategoryBars, terceira seção no Budget, coluna no histórico, edição de kind em Settings.

**Tech Stack:** FastAPI + SQLAlchemy + pytest (backend); React + TanStack Query + vitest (frontend).

**Semântica de sinal (usada em todo o plano):** `real_by_category` soma centavos assinados por categoria (aporte = negativo). O "líquido investido" exposto na API é o **negativo** dessa soma: positivo = aportou mais do que resgatou.

**Pré-condição (Task 0):** a árvore tem trabalho pendente não commitado (ordenação alfabética de categorias). Commitá-lo antes, como commit próprio.

---

### Task 0: Commitar trabalho pendente de ordenação alfabética

**Files:**
- Já modificados na árvore: `backend/app/normalize.py`, `backend/app/routers/meta.py`, `backend/app/routers/budgets.py`, `backend/app/services/budget.py`, `backend/tests/test_api_meta.py`, `frontend/src/components/dashboard/CategoryBars.tsx`

- [ ] **Step 0.1: Rodar os testes do backend para confirmar que a árvore está verde**

Run: `cd /home/mathe/programming/financial-tracking-platform/backend && python -m pytest -q`
Expected: todos passam.

- [ ] **Step 0.2: Commitar o trabalho pendente (não misturar com o desta feature)**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add backend/app/normalize.py backend/app/routers/meta.py backend/app/routers/budgets.py backend/app/services/budget.py backend/tests/test_api_meta.py frontend/src/components/dashboard/CategoryBars.tsx
git commit -m "feat(api): sort categories and budget lines alphabetically"
```

(Se algum teste falhar no Step 0.1, parar e reportar ao usuário antes de commitar.)

---

### Task 1: Backend — seed e constante de kinds

**Files:**
- Modify: `backend/app/models.py` (topo do arquivo, junto às definições)
- Modify: `backend/app/seed.py`
- Test: `backend/tests/test_models_seed.py`

- [ ] **Step 1.1: Atualizar o teste de seed (vai falhar)**

Em `backend/tests/test_models_seed.py`, substituir a função `test_seed_categories` por:

```python
def test_seed_categories(session):
    saida = session.scalar(
        select(func.count()).select_from(Category).where(Category.kind == "saida")
    )
    entrada = session.scalar(
        select(func.count()).select_from(Category).where(Category.kind == "entrada")
    )
    investimento = session.scalar(
        select(func.count()).select_from(Category).where(Category.kind == "investimento")
    )
    assert saida == 14  # inclui Outros
    assert entrada == 3
    assert investimento == 1  # Investimentos
    names = {c.name for c in session.scalars(select(Category))}
    assert {"Investimentos", "Salário", "Mercado"} <= names
```

- [ ] **Step 1.2: Rodar e ver falhar**

Run: `cd backend && python -m pytest tests/test_models_seed.py -q`
Expected: FAIL (`saida == 14` — hoje são 15 e `investimento == 0`).

- [ ] **Step 1.3: Implementar**

Em `backend/app/models.py`, logo após os imports, adicionar a constante (fonte única para validação):

```python
CATEGORY_KINDS = ("entrada", "saida", "investimento")
```

Em `backend/app/seed.py`, remover `"Investimentos"` da lista `SAIDA` e criar a lista nova:

```python
SAIDA = [
    "Mercado", "Restaurantes/Delivery", "Transporte", "Moradia",
    "Contas & Utilidades", "Saúde", "Lazer", "Assinaturas", "Vestuário",
    "Educação", "Viagem", "Presentes", "Impostos & Taxas",
    "Outros",
]
ENTRADA = ["Salário", "Rendimentos", "Outras Entradas"]
INVESTIMENTO = ["Investimentos"]
```

E na função `seed`, dentro do `if` de categorias:

```python
    if session.scalar(select(func.count()).select_from(Category)) == 0:
        session.add_all(Category(name=n, kind="saida") for n in SAIDA)
        session.add_all(Category(name=n, kind="entrada") for n in ENTRADA)
        session.add_all(Category(name=n, kind="investimento") for n in INVESTIMENTO)
```

(Obs.: o seed só roda em banco vazio — o banco real do usuário é convertido pela UI na Task 7.)

- [ ] **Step 1.4: Rodar e ver passar**

Run: `cd backend && python -m pytest tests/test_models_seed.py -q`
Expected: PASS.

- [ ] **Step 1.5: Rodar a suíte toda do backend**

Run: `cd backend && python -m pytest -q`
Expected: **1 falha conhecida**: `test_month_summary_cash_flow` (Investimentos saiu de `saidas_orc`, então `orcado` de saídas vira 150000). É o teste que a Task 2 corrige junto com a lógica nova. Nenhuma outra falha é aceitável.

- [ ] **Step 1.6: NÃO commitar ainda** — a Task 2 completa a mudança lógica; commit único ao fim dela.

---

### Task 2: Backend — `month_summary` com bloco `investimentos`

**Files:**
- Modify: `backend/app/services/budget.py:45-93` (função `month_summary`)
- Test: `backend/tests/test_budget.py`

- [ ] **Step 2.1: Atualizar `test_month_summary_cash_flow` e adicionar os testes novos**

Em `backend/tests/test_budget.py`, substituir `test_month_summary_cash_flow` por:

```python
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
    assert s["saidas"] == {"real": 124000, "orcado": 150000}
    assert s["investimentos"] == {"real": 200000, "orcado": 200000}
    # saldo continua sendo a variação real de caixa — idêntico ao valor pré-mudança
    assert s["saldo"] == {"real": 526000, "orcado": 500000}
    # ritmo agora só olha saídas de consumo: (124000/150000) / (15/31)
    assert abs(s["ritmo"] - (124000 / 150000) / (15 / 31)) < 0.001
    linha_mercado = next(c for c in s["categorias"] if c["id"] == mercado.id)
    assert linha_mercado == {
        "id": mercado.id, "nome": "Mercado", "kind": "saida",
        "real": 124000, "orcado": 150000,
    }
    linha_invest = next(c for c in s["categorias"] if c["id"] == invest.id)
    assert linha_invest == {
        "id": invest.id, "nome": "Investimentos", "kind": "investimento",
        "real": 200000, "orcado": 200000,
    }
```

E adicionar ao fim do arquivo:

```python
def test_investimentos_resgate_nao_abate_saidas(session):
    mercado, invest = cat(session, "Mercado"), cat(session, "Investimentos")
    add_tx(session, mercado.id, -100000)
    add_tx(session, invest.id, -200000)  # aporte
    add_tx(session, invest.id, 50000)    # resgate parcial
    s = month_summary(session, "2026-08", today=date(2026, 8, 15))
    assert s["saidas"]["real"] == 100000       # resgate não reduz saídas
    assert s["entradas"]["real"] == 0          # nem vira entrada
    assert s["investimentos"]["real"] == 150000
    assert s["saldo"]["real"] == -250000       # variação real de caixa
    linha = next(c for c in s["categorias"] if c["id"] == invest.id)
    assert linha["real"] == 150000


def test_investimentos_liquido_negativo_quando_resgata_mais(session):
    invest = cat(session, "Investimentos")
    add_tx(session, invest.id, -100000)  # aporte
    add_tx(session, invest.id, 150000)   # resgate maior (o bug de junho)
    s = month_summary(session, "2026-08", today=date(2026, 8, 15))
    assert s["investimentos"]["real"] == -50000  # com sinal, sem abs()
    assert s["saidas"]["real"] == 0
    assert s["entradas"]["real"] == 0
    assert s["saldo"]["real"] == 50000  # entrou 50k em caixa
    linha = next(c for c in s["categorias"] if c["id"] == invest.id)
    assert linha["real"] == -50000


def test_investimentos_sem_meta(session):
    invest = cat(session, "Investimentos")
    add_tx(session, invest.id, -100000)
    s = month_summary(session, "2026-08", today=date(2026, 8, 15))
    assert s["investimentos"] == {"real": 100000, "orcado": 0}
    assert s["ritmo"] is None  # sem orçamento de saídas
```

- [ ] **Step 2.2: Rodar e ver falhar**

Run: `cd backend && python -m pytest tests/test_budget.py -q`
Expected: FAIL — `KeyError: 'investimentos'` (o bloco ainda não existe) e valores de saídas.

- [ ] **Step 2.3: Implementar em `month_summary`**

Em `backend/app/services/budget.py`, substituir o corpo de `month_summary` a partir de `entradas_real = saidas_real = 0` até o `return` por:

```python
    entradas_real = saidas_real = invest_real = 0
    for cat_id, cents in real.items():
        if cat_id in ("uncat_in", "uncat_out"):
            continue
        kind = cats[cat_id].kind
        if kind == "entrada":
            entradas_real += cents
        elif kind == "investimento":
            invest_real += -cents  # positivo = aportou mais do que resgatou
        else:
            saidas_real += -cents
    entradas_real += real.get("uncat_in", 0)
    saidas_real += -real.get("uncat_out", 0)
    entradas_orc = sum(v for cid, v in bmap.items() if cats[cid].kind == "entrada")
    saidas_orc = sum(v for cid, v in bmap.items() if cats[cid].kind == "saida")
    invest_orc = sum(v for cid, v in bmap.items() if cats[cid].kind == "investimento")

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
            # investimento: líquido com sinal (negativo = resgatou mais);
            # demais: valor absoluto, como antes
            "real": -real.get(c.id, 0) if c.kind == "investimento" else abs(real.get(c.id, 0)),
            "orcado": bmap.get(c.id, 0),
        }
        for c in cats.values()
        if not c.archived and (c.id in real or c.id in bmap)
    ]
    return {
        "month": month,
        "entradas": {"real": entradas_real, "orcado": entradas_orc},
        "saidas": {"real": saidas_real, "orcado": saidas_orc},
        "investimentos": {"real": invest_real, "orcado": invest_orc},
        "saldo": {
            "real": entradas_real - saidas_real - invest_real,
            "orcado": entradas_orc - saidas_orc - invest_orc,
        },
        "ritmo": ritmo,
        "categorias": sorted(categorias, key=lambda c: (c["kind"], name_sort_key(c["nome"]))),
    }
```

- [ ] **Step 2.4: Rodar a suíte do backend inteira e ver passar**

Run: `cd backend && python -m pytest -q`
Expected: PASS (inclusive `test_models_seed.py` da Task 1).

- [ ] **Step 2.5: Commit (Tasks 1+2 = uma mudança lógica)**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add backend/app/models.py backend/app/seed.py backend/app/services/budget.py backend/tests/test_models_seed.py backend/tests/test_budget.py
git commit -m "feat(dashboard): report investment categories as net flow

Categories with kind \"investimento\" leave entradas/saidas and get
their own investimentos block in the month summary: signed net of
the month (contributions minus withdrawals) vs. budgeted target.
Saldo formula unchanged in value (still real cash variation).
Fixes withdrawals silently shrinking the month's expense total."
```

---

### Task 3: Backend — teste de regressão do bridge

**Files:**
- Test: `backend/tests/test_bridge.py` (sem mudança em `backend/app/services/bridge.py` — o `else` de `sign = 1 if kind == "entrada" else -1` já dá sinal −1 a `investimento`, mantendo o saldo do bridge igual ao KPI)

- [ ] **Step 3.1: Adicionar o teste**

Ao fim de `backend/tests/test_bridge.py`:

```python
def test_bridge_investimento_treated_with_expense_sign(session):
    invest = cat(session, "Investimentos")
    session.add(Budget(category_id=invest.id, amount_cents=200000, valid_from="2026-01"))
    session.flush()
    add_tx(session, invest.id, -150000, date(2026, 8, 5))  # aportou 50k a menos que a meta

    b = bridge(session, "month", "2026-08")
    assert b["start"] == -200000  # meta de aporte reduz o saldo projetado
    step = next(s for s in b["steps"] if s["categoria"] == "Investimentos")
    assert step["delta"] == 50000  # aportar menos que a meta melhora o saldo de caixa
    assert b["start"] + sum(s["delta"] for s in b["steps"]) == b["end"]
```

- [ ] **Step 3.2: Rodar e ver passar (regressão — deve passar sem mudança de código)**

Run: `cd backend && python -m pytest tests/test_bridge.py -q`
Expected: PASS. (Se falhar, o bridge não está tratando o kind novo — investigar antes de seguir.)

- [ ] **Step 3.3: Commit**

```bash
git add backend/tests/test_bridge.py
git commit -m "test(bridge): cover investimento kind sign handling"
```

---

### Task 4: Backend — API aceita e edita kind "investimento"

**Files:**
- Modify: `backend/app/schemas.py:6-15`
- Modify: `backend/app/routers/meta.py:57-79`
- Test: `backend/tests/test_api_meta.py`

- [ ] **Step 4.1: Escrever os testes (vão falhar)**

Ao fim de `backend/tests/test_api_meta.py`:

```python
def test_create_category_kind_investimento(client):
    r = client.post("/api/categories", json={"name": "Cripto", "kind": "investimento"})
    assert r.status_code == 201 and r.json()["kind"] == "investimento"


def test_create_category_invalid_kind_is_400(client):
    r = client.post("/api/categories", json={"name": "X", "kind": "poupanca"})
    assert r.status_code == 400


def test_patch_category_kind(client):
    cats = client.get("/api/categories").json()
    invest = next(c for c in cats if c["name"] == "Investimentos")
    r = client.patch(f"/api/categories/{invest['id']}", json={"kind": "saida"})
    assert r.status_code == 200 and r.json()["kind"] == "saida"
    r = client.patch(f"/api/categories/{invest['id']}", json={"kind": "investimento"})
    assert r.status_code == 200 and r.json()["kind"] == "investimento"


def test_patch_category_invalid_kind_is_400(client):
    cats = client.get("/api/categories").json()
    r = client.patch(f"/api/categories/{cats[0]['id']}", json={"kind": "poupanca"})
    assert r.status_code == 400
```

- [ ] **Step 4.2: Rodar e ver falhar**

Run: `cd backend && python -m pytest tests/test_api_meta.py -q`
Expected: FAIL — criação com kind investimento retorna 400; PATCH de kind é ignorado (retorna kind antigo).

- [ ] **Step 4.3: Implementar**

Em `backend/app/schemas.py`, adicionar `kind` ao patch:

```python
class CategoryPatch(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    archived: Optional[bool] = None
    kind: Optional[str] = None  # "entrada" | "saida" | "investimento"
```

Em `backend/app/routers/meta.py`, importar a constante (junto ao import de models):

```python
from app.models import Account, Category, IgnoreRule, Rule, Setting
from app.models import CATEGORY_KINDS
```

Em `create_category`, trocar a validação:

```python
    if payload.kind not in CATEGORY_KINDS:
        raise HTTPException(400, "kind deve ser 'entrada', 'saida' ou 'investimento'")
```

Em `patch_category`, validar e incluir `kind` no loop de campos:

```python
@router.patch("/categories/{cat_id}")
def patch_category(cat_id: int, payload: CategoryPatch, session=Depends(get_session)):
    cat = session.get(Category, cat_id)
    if not cat:
        raise HTTPException(404, "Categoria não encontrada")
    if payload.kind is not None and payload.kind not in CATEGORY_KINDS:
        raise HTTPException(400, "kind deve ser 'entrada', 'saida' ou 'investimento'")
    for field in ("name", "color", "archived", "kind"):
        value = getattr(payload, field)
        if value is not None:
            setattr(cat, field, value)
    session.commit()
    return _cat_out(cat)
```

- [ ] **Step 4.4: Rodar a suíte do backend e ver passar**

Run: `cd backend && python -m pytest -q`
Expected: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add backend/app/schemas.py backend/app/routers/meta.py backend/tests/test_api_meta.py
git commit -m "feat(api): accept and edit category kind investimento"
```

---

### Task 5: Frontend — types, hooks e helper da barra de investimento

**Files:**
- Modify: `frontend/src/api/types.ts:8-48,64-69`
- Modify: `frontend/src/api/hooks.ts:150-154`
- Create: `frontend/src/lib/investBar.ts`
- Test: `frontend/src/lib/investBar.test.ts`

- [ ] **Step 5.1: Atualizar os types**

Em `frontend/src/api/types.ts`:

```ts
export type CategoryKind = "entrada" | "saida" | "investimento";
```

(colocar acima de `Category`) e trocar as três ocorrências de `kind: "entrada" | "saida";` (em `Category`, `CatLine` e `BudgetLine`) por `kind: CategoryKind;`. Em `Summary`, adicionar o campo após `saidas`:

```ts
export interface Summary {
  month: string;
  entradas: RealOrc;
  saidas: RealOrc;
  investimentos: RealOrc;
  saldo: RealOrc;
  ritmo: number | null;
  categorias: CatLine[];
}
```

- [ ] **Step 5.2: Atualizar `usePatchCategory` em `frontend/src/api/hooks.ts`**

Adicionar `CategoryKind` ao import de types e:

```ts
export const usePatchCategory = () =>
  useInvalidatingMutation(
    ({
      id,
      patch,
    }: {
      id: number;
      patch: { name?: string; color?: string; archived?: boolean; kind?: CategoryKind };
    }) => api(`/categories/${id}`, jsonBody("PATCH", patch))
  );
```

- [ ] **Step 5.3: Escrever o teste do helper (vai falhar — módulo não existe)**

Create `frontend/src/lib/investBar.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { investBarView } from "./investBar";

describe("investBarView", () => {
  it("progresso normal em direção à meta", () => {
    expect(investBarView(150000, 200000)).toEqual({
      pct: 75,
      met: false,
      negative: false,
    });
  });

  it("meta atingida ou superada é sucesso, não estouro", () => {
    expect(investBarView(200000, 200000)).toEqual({ pct: 100, met: true, negative: false });
    expect(investBarView(250000, 200000)).toEqual({ pct: 100, met: true, negative: false });
  });

  it("líquido negativo (resgatou mais que aportou): barra vazia", () => {
    expect(investBarView(-50000, 200000)).toEqual({ pct: 0, met: false, negative: true });
    expect(investBarView(-50000, 0)).toEqual({ pct: 0, met: false, negative: true });
  });

  it("sem meta: barra cheia se aportou, vazia se não", () => {
    expect(investBarView(100000, 0)).toEqual({ pct: 100, met: false, negative: false });
    expect(investBarView(0, 0)).toEqual({ pct: 0, met: false, negative: false });
  });
});
```

- [ ] **Step 5.4: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/investBar.test.ts`
Expected: FAIL (módulo `./investBar` não existe).

- [ ] **Step 5.5: Implementar o helper**

Create `frontend/src/lib/investBar.ts`:

```ts
// Estado visual da barra de investimento: líquido do mês (com sinal) vs. meta.
// Superar a meta de aporte é sucesso — não existe "estouro" como nas saídas.
export interface InvestBarView {
  pct: number;
  met: boolean;
  negative: boolean;
}

export function investBarView(realCents: number, orcadoCents: number): InvestBarView {
  if (realCents < 0) return { pct: 0, met: false, negative: true };
  if (orcadoCents > 0)
    return {
      pct: Math.min(100, (realCents / orcadoCents) * 100),
      met: realCents >= orcadoCents,
      negative: false,
    };
  return { pct: realCents > 0 ? 100 : 0, met: false, negative: false };
}
```

- [ ] **Step 5.6: Rodar testes e typecheck**

Run: `cd frontend && npx vitest run src/lib/investBar.test.ts && npx tsc --noEmit`
Expected: testes PASS; `tsc` sem erros (os componentes ainda não usam `investimentos`, e alargar `kind` para `CategoryKind` não quebra os call sites existentes — se `tsc` apontar algo, corrigir antes de seguir).

- [ ] **Step 5.7: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/hooks.ts frontend/src/lib/investBar.ts frontend/src/lib/investBar.test.ts
git commit -m "feat(ui): investimento category kind types and invest bar helper"
```

---

### Task 6: Frontend — dashboard (KpiRow + CategoryBars)

**Files:**
- Modify: `frontend/src/components/dashboard/KpiRow.tsx`
- Modify: `frontend/src/components/dashboard/CategoryBars.tsx`

- [ ] **Step 6.1: Tile "Investido" no KpiRow**

Em `frontend/src/components/dashboard/KpiRow.tsx`, inserir entre o tile "Saídas" e o "Saldo" (ordem espelha Entradas − Saídas − Investido = Saldo):

```tsx
      <StatTile
        label="Investido"
        value={formatBRL(s.investimentos.real)}
        sub={
          s.investimentos.real < 0
            ? "resgate líquido no mês"
            : s.investimentos.orcado > 0
              ? `meta ${formatBRL(s.investimentos.orcado)}`
              : "sem meta"
        }
        tone={
          s.investimentos.real < 0
            ? "bad"
            : s.investimentos.orcado > 0 && s.investimentos.real >= s.investimentos.orcado
              ? "good"
              : undefined
        }
      />
```

(`.tiles` usa `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))` — acomoda 5 tiles sem mudança de CSS.)

- [ ] **Step 6.2: Terceiro bloco no CategoryBars**

Em `frontend/src/components/dashboard/CategoryBars.tsx`:

Adicionar aos imports:

```tsx
import { investBarView } from "../../lib/investBar";
```

No componente `CategoryBars`, adicionar o filtro e o bloco (depois do bloco de entradas):

```tsx
  const investimentos = s.categorias.filter((c) => c.kind === "investimento");
```

```tsx
      {investimentos.length > 0 && (
        <>
          <h3 style={{ marginTop: 14 }}>Investimentos</h3>
          {investimentos.map((c) => (
            <InvestBar key={c.id} line={c} />
          ))}
        </>
      )}
```

E adicionar o componente ao fim do arquivo:

```tsx
function InvestBar({ line }: { line: CatLine }) {
  const v = investBarView(line.real, line.orcado);
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
        <span>
          {line.nome}
          {v.met && (
            <span className="badge" style={{ color: "var(--good)", marginLeft: 6 }}>
              ✓ meta
            </span>
          )}
        </span>
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            color: v.negative ? "var(--critical)" : undefined,
          }}
        >
          {v.negative
            ? `${formatBRL(line.real)} · resgate líquido`
            : `${formatBRL(line.real)} / ${line.orcado > 0 ? formatBRL(line.orcado) : "—"}`}
        </span>
      </div>
      <div className="bar-track">
        <div
          className="bar-fill"
          style={{ width: `${v.pct}%`, ...(v.met ? { background: "var(--good)" } : {}) }}
        />
      </div>
    </div>
  );
}
```

Obs.: o filtro `saidas` existente (`c.kind === "saida"`) já deixa de incluir investimentos naturalmente.

- [ ] **Step 6.3: Typecheck + testes**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: sem erros; testes PASS.

- [ ] **Step 6.4: Commit**

```bash
git add frontend/src/components/dashboard/KpiRow.tsx frontend/src/components/dashboard/CategoryBars.tsx
git commit -m "feat(dashboard): show net invested tile and investment bars"
```

---

### Task 7: Frontend — orçamento e settings

**Files:**
- Modify: `frontend/src/pages/Budget.tsx`
- Modify: `frontend/src/pages/Settings.tsx:86-166` (CategoriesSection)

- [ ] **Step 7.1: Terceira seção e saldo projetado em `Budget.tsx`**

Adicionar o import de tipo:

```tsx
import type { CategoryKind } from "../api/types";
```

Adicionar a constante acima do componente `Budget`:

```tsx
const KIND_LABELS: Record<CategoryKind, string> = {
  entrada: "Entradas",
  saida: "Saídas",
  investimento: "Investimentos",
};
```

Trocar a assinatura de `total` e o `saldoProjetado`:

```tsx
  const total = (kind: CategoryKind) =>
    active
      .filter((c) => c.kind === kind)
      .reduce((sum, c) => sum + (budgetById.get(c.id) ?? 0), 0);
  const saldoProjetado = total("entrada") - total("saida") - total("investimento");
```

No JSX, trocar o map das colunas:

```tsx
        {(["entrada", "saida", "investimento"] as const).map((kind) => (
          <div key={kind} className="card" style={{ flex: 1, minWidth: 320 }}>
            <h3>{KIND_LABELS[kind]}</h3>
```

(o restante da coluna — tabela, `BudgetInput`, linha de total — permanece igual; o card de "Saldo líquido projetado" já usa `saldoProjetado`).

- [ ] **Step 7.2: Coluna "Investido" no `BudgetHistory`**

No `<thead>`, entre Saídas e Saldo:

```tsx
            <th className="num">Investido (real / orç.)</th>
```

No corpo, entre as células de saídas e saldo:

```tsx
                <td className="num">
                  {s
                    ? `${formatBRL(s.investimentos.real)} / ${formatBRL(s.investimentos.orcado)}`
                    : "…"}
                </td>
```

- [ ] **Step 7.3: Settings — criação com 3 kinds e edição de kind com confirm**

Em `frontend/src/pages/Settings.tsx`, adicionar o import de tipo:

```tsx
import type { CategoryKind } from "../api/types";
```

Na `CategoriesSection`, trocar o estado e o select de criação:

```tsx
  const [kind, setKind] = useState<CategoryKind>("saida");
```

```tsx
        <select value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
          <option value="saida">saída</option>
          <option value="entrada">entrada</option>
          <option value="investimento">investimento</option>
        </select>
```

Na tabela, substituir a célula do badge estático (`<span className="badge">{c.kind}</span>`) por um select com confirm — trocar o kind reinterpreta todos os meses retroativamente, então o usuário confirma antes:

```tsx
              <td>
                <select
                  value={c.kind}
                  aria-label={`Tipo da categoria ${c.name}`}
                  onChange={(e) => {
                    const kind = e.target.value as CategoryKind;
                    if (
                      window.confirm(
                        `Mudar "${c.name}" de "${c.kind}" para "${kind}"? Os dashboards de todos os meses, inclusive passados, passam a interpretar a categoria pelo novo tipo.`
                      )
                    )
                      patchCategory.mutate({ id: c.id, patch: { kind } });
                  }}
                >
                  <option value="saida">saída</option>
                  <option value="entrada">entrada</option>
                  <option value="investimento">investimento</option>
                </select>
              </td>
```

(Se o usuário cancelar o confirm, nada é mutado e o select controlado volta ao valor de `c.kind` no re-render.)

- [ ] **Step 7.4: Typecheck + testes + build**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run build`
Expected: tudo PASS, build limpo.

- [ ] **Step 7.5: Commit**

```bash
git add frontend/src/pages/Budget.tsx frontend/src/pages/Settings.tsx
git commit -m "feat(budget): investment section, projected balance and kind editing"
```

---

### Task 8: Verificação final

- [ ] **Step 8.1: Suítes completas**

Run: `cd backend && python -m pytest -q && cd ../frontend && npm test && npx tsc --noEmit`
Expected: tudo PASS.

- [ ] **Step 8.2: Verificação visual (skill webapp-testing)**

Subir o app e conferir com Playwright (ou manualmente):
1. Dashboard de um mês com aporte + resgate: tile "Investido" com líquido correto; Saídas sem os investimentos; Saldo igual ao valor anterior à mudança; bloco "Investimentos" nas barras.
2. Mês com resgate > aporte (junho/2026 no banco real, após o passo 8.3): tile em vermelho com valor negativo e "resgate líquido"; barra vazia.
3. Orçamento: terceira seção com input funcionando; saldo projetado desconta a meta de investimento; histórico com a coluna "Investido".
4. Settings: criar categoria com kind investimento; editar kind com confirm.

- [ ] **Step 8.3: Converter a categoria real do usuário**

No banco real (app rodando), via Settings: mudar a categoria "Investimentos" para o tipo "investimento" e confirmar. Depois conferir junho/2026 no dashboard (o caso que motivou a feature).

- [ ] **Step 8.4: Revisão final**

Usar a skill superpowers:requesting-code-review para uma revisão única do branch (preferência do usuário: sem revisor por task, uma revisão ao final).
