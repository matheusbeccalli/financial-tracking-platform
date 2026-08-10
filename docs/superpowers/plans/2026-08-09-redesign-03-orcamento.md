# Redesign — Plano 03: Orçamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a tela de Orçamento conforme o protótipo `Orcamento.dc.html` do bundle de handoff (local, não versionado) — strip de 4 KPIs com saldo operacional separado do aporte, card de saídas em duas colunas com barra de peso e bloco "sem orçamento definido", rail direito grudado (Entradas, Investimentos, Como o mês fecha) e histórico real vs. orçado com investimento em coluna própria.

**Architecture:** A tela passa a combinar duas fontes que hoje ela não cruza: `GET /budgets?month=` (o orçado) e `GET /dashboard/summary?month=` (o realizado), porque o design mostra "R$ 93 já gastos" nas categorias sem orçamento e "Realizado em ago" no card de investimentos. Todo o cálculo (agrupamento, peso relativo, totais, saldo operacional vs. líquido) vai para um módulo puro `lib/budget.ts` testado com vitest. A gravação continua como é hoje: `BudgetInput` grava no blur/Enter, um `PUT /budgets` por linha — o protótipo não tem botão de salvar. A página se divide em componentes sob `components/budget/`.

**Tech Stack:** React 19 + TypeScript, TanStack Query, vitest, CSS puro com os tokens e primitivos dos planos 00–02. Sem backend novo.

**Spec:** `docs/superpowers/specs/2026-08-09-frontend-redesign-design.md`

**Baseline antes de começar:** frontend 90 testes, backend 110 testes, ambos verdes, em `d86570b`.

### Decisões tomadas para este plano

1. **Sem botão de salvar.** O protótipo não tem um, e a gravação por linha no blur já existe e funciona. O "dirty tracking" citado na spec do handoff descreve o estado interno do `BudgetInput`, que já faz isso.
2. **O rail generaliza para N categorias de investimento.** O protótipo desenha um único input "Aporte mensal" porque o usuário tem exatamente uma categoria `investimento`; renderizar uma linha por categoria custa o mesmo e não quebra se ele criar outra.
3. **"Copiar de…" vira botão com `<select>` nativo invisível por cima**, o mesmo padrão do `CategoryChip`. Mantém os optgroups de meses anteriores/seguintes e o `window.confirm` que já existem.
4. **O histórico continua com 6 meses**, não os 4 do protótipo — é o que a tela mostra hoje e mais contexto não atrapalha.
5. **Limiar de destaque da barra de peso: R$ 3.000**, como o handoff especifica. É um número absoluto calibrado para a escala deste usuário, não uma proporção; fica isolado numa constante nomeada para ser fácil de mudar.

---

### Task 1: Módulo puro `lib/budget.ts` (TDD)

**Files:**
- Create: `frontend/src/lib/budget.ts`
- Test: `frontend/src/lib/budget.test.ts`

- [ ] **Step 1.0: Mover `pctRaw` para `lib/pct.ts`**

`pctRaw` (percentual sem teto) nasceu em `lib/dashboard.ts` no plano 01, mas é um
helper genérico e agora o módulo de orçamento também precisa dele. A casa dele é
`lib/pct.ts`, junto de `clampPct`/`pctOf`.

1. Recortar a função e o seu comentário de `frontend/src/lib/dashboard.ts` e colar ao
   final de `frontend/src/lib/pct.ts`.
2. Em `frontend/src/lib/dashboard.ts`, ajustar o import para
   `import { clampPct, pctOf, pctRaw } from "./pct";`.
3. Em `frontend/src/lib/dashboard.test.ts`, remover `pctRaw` do import e mover o bloco
   `describe("pctRaw", …)` para `frontend/src/lib/pct.test.ts`, acrescentando `pctRaw`
   ao import de `./pct`.
4. Em `frontend/src/components/dashboard/KpiStrip.tsx`, trocar
   `import { investLabel, pctRaw } from "../../lib/dashboard";` por duas linhas:
   `import { investLabel } from "../../lib/dashboard";` e
   `import { pctRaw } from "../../lib/pct";`.

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: 90 testes, todos passando (só mudaram de arquivo).

- [ ] **Step 1.1: Escrever os testes**

Create `frontend/src/lib/budget.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Category, CategoryKind } from "../api/types";
import { budgetTotals, expenseRows } from "./budget";

const cat = (id: number, name: string, kind: CategoryKind = "saida"): Category => ({
  id,
  name,
  kind,
  color: "#888",
  archived: false,
});

const CATS = [
  cat(1, "Crédito Imobiliário"),
  cat(2, "Mercado"),
  cat(3, "Aula Padel"),
  cat(4, "Impostos & Taxas"),
  cat(5, "Educação"),
  cat(10, "Salário", "entrada"),
  cat(11, "Rendimentos", "entrada"),
  cat(12, "Outras Entradas", "entrada"),
  cat(20, "Investimentos", "investimento"),
];

// orçado por categoria
const ORC = new Map([
  [1, 890000],
  [2, 70000],
  [3, 110000],
  [10, 5171200],
  [20, 280000],
]);

// realizado por categoria
const REAL = new Map([[4, 9346]]);

describe("expenseRows", () => {
  it("separa saídas com e sem orçamento", () => {
    const v = expenseRows(CATS, ORC, REAL, "valor");
    expect(v.comOrcamento.map((r) => r.nome)).toEqual([
      "Crédito Imobiliário",
      "Aula Padel",
      "Mercado",
    ]);
    expect(v.semOrcamento.map((r) => r.nome)).toEqual(["Educação", "Impostos & Taxas"]);
  });

  it("ordena por nome quando pedido, respeitando acentos", () => {
    const v = expenseRows(CATS, ORC, REAL, "nome");
    expect(v.comOrcamento.map((r) => r.nome)).toEqual([
      "Aula Padel",
      "Crédito Imobiliário",
      "Mercado",
    ]);
  });

  it("a barra é o peso relativo à maior linha", () => {
    const v = expenseRows(CATS, ORC, REAL, "valor");
    expect(v.comOrcamento[0].pesoPct).toBe(100);
    expect(v.comOrcamento[2].pesoPct).toBeCloseTo(7.87, 2); // 70000/890000
  });

  it("destaca as linhas grandes (≥ R$ 3.000)", () => {
    const v = expenseRows(CATS, ORC, REAL, "valor");
    expect(v.comOrcamento[0].destaque).toBe(true); // 8.900
    expect(v.comOrcamento[1].destaque).toBe(false); // 1.100
  });

  it("mostra o que já foi gasto nas categorias sem orçamento", () => {
    const v = expenseRows(CATS, ORC, REAL, "valor");
    const impostos = v.semOrcamento.find((r) => r.nome === "Impostos & Taxas")!;
    expect(impostos.jaGasto).toBe(9346);
    const educacao = v.semOrcamento.find((r) => r.nome === "Educação")!;
    expect(educacao.jaGasto).toBe(0);
  });

  it("o bloco sem orçamento é sempre alfabético; o aviso de gasto é visual", () => {
    const v = expenseRows(CATS, ORC, REAL, "valor");
    expect(v.semOrcamento.map((r) => r.nome)).toEqual(["Educação", "Impostos & Taxas"]);
    // a ordenação escolhida não afeta este bloco
    const porNome = expenseRows(CATS, ORC, REAL, "nome");
    expect(porNome.semOrcamento.map((r) => r.nome)).toEqual(v.semOrcamento.map((r) => r.nome));
  });

  it("total das saídas soma só o orçado", () => {
    const v = expenseRows(CATS, ORC, REAL, "valor");
    expect(v.total).toBe(890000 + 110000 + 70000);
  });

  it("categoria arquivada fica fora", () => {
    const arch = { ...cat(9, "Velha"), archived: true };
    const v = expenseRows([...CATS, arch], ORC, REAL, "valor");
    expect(v.comOrcamento.concat(v.semOrcamento).some((r) => r.nome === "Velha")).toBe(false);
  });

  it("sem nenhuma saída orçada não divide por zero", () => {
    const v = expenseRows([cat(1, "X")], new Map(), new Map(), "valor");
    expect(v.comOrcamento).toEqual([]);
    expect(v.semOrcamento[0].pesoPct).toBe(0);
    expect(v.total).toBe(0);
  });
});

describe("budgetTotals", () => {
  it("separa saldo operacional de saldo líquido", () => {
    const t = budgetTotals(CATS, ORC);
    expect(t.entradas).toBe(5171200);
    expect(t.saidas).toBe(1070000);
    expect(t.investimento).toBe(280000);
    expect(t.operacional).toBe(5171200 - 1070000);
    expect(t.liquido).toBe(5171200 - 1070000 - 280000);
  });

  it("conta linhas de entrada preenchidas e categorias de saída orçadas", () => {
    const t = budgetTotals(CATS, ORC);
    expect(t.entradasPreenchidas).toBe(1);
    expect(t.entradasLinhas).toBe(3);
    expect(t.saidasCategorias).toBe(3);
  });

  it("percentuais sobre as entradas", () => {
    const t = budgetTotals(CATS, ORC);
    expect(t.saidasPctEntradas).toBeCloseTo(20.69, 2);
    expect(t.investPctEntradas).toBeCloseTo(5.41, 2);
  });

  it("sem entradas orçadas os percentuais são zero, não infinito", () => {
    const t = budgetTotals(CATS, new Map([[2, 70000]]));
    expect(t.entradas).toBe(0);
    expect(t.saidasPctEntradas).toBe(0);
    expect(t.investPctEntradas).toBe(0);
  });
});
```

- [ ] **Step 1.2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/budget.test.ts`
Expected: FAIL — `Cannot find module './budget'`.

- [ ] **Step 1.3: Implementar**

Create `frontend/src/lib/budget.ts`:

```ts
import type { Category } from "../api/types";
import { pctRaw } from "./pct";

/**
 * Acima disso a barra de peso fica em accent cheio. É um valor absoluto calibrado
 * para a escala deste orçamento (o handoff pede R$ 3.000), não uma proporção.
 */
const LINHA_GRANDE = 300000;

export type BudgetSort = "valor" | "nome";

export interface BudgetLineRow {
  id: number;
  nome: string;
  /** Orçado da categoria no mês, em centavos. */
  cents: number;
  /** Largura da barra: peso relativo à maior linha orçada. */
  pesoPct: number;
  destaque: boolean;
  /** Realizado no mês — só interessa nas linhas sem orçamento definido. */
  jaGasto: number;
}

export interface BudgetView {
  comOrcamento: BudgetLineRow[];
  semOrcamento: BudgetLineRow[];
  total: number;
}

const porNome = (a: { nome: string }, b: { nome: string }) =>
  a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });

/**
 * Divide as saídas entre as que têm orçamento e as que não têm. O bloco "sem
 * orçamento definido" existe para ser preenchido, então é sempre alfabético — o que
 * chama atenção nele é o aviso de gasto já realizado, não a posição.
 */
export function expenseRows(
  categories: Category[],
  orcado: Map<number, number>,
  real: Map<number, number>,
  sort: BudgetSort
): BudgetView {
  const saidas = categories.filter((c) => !c.archived && c.kind === "saida");
  const linhas = saidas.map((c) => ({
    id: c.id,
    nome: c.name,
    cents: orcado.get(c.id) ?? 0,
    jaGasto: real.get(c.id) ?? 0,
  }));

  const comOrcamento = linhas.filter((l) => l.cents > 0);
  const semOrcamento = linhas.filter((l) => l.cents <= 0).sort(porNome);
  const maior = Math.max(0, ...comOrcamento.map((l) => l.cents));

  comOrcamento.sort(sort === "valor" ? (a, b) => b.cents - a.cents || porNome(a, b) : porNome);

  const decorar = (l: (typeof linhas)[number]): BudgetLineRow => ({
    ...l,
    pesoPct: maior > 0 ? pctRaw(l.cents, maior) : 0,
    destaque: l.cents >= LINHA_GRANDE,
  });

  return {
    comOrcamento: comOrcamento.map(decorar),
    semOrcamento: semOrcamento.map(decorar),
    total: comOrcamento.reduce((sum, l) => sum + l.cents, 0),
  };
}

export interface BudgetTotals {
  entradas: number;
  saidas: number;
  investimento: number;
  /** Entradas − saídas. Deliberadamente **sem** o aporte: investir não é gastar. */
  operacional: number;
  /** Operacional − aporte planejado: o que sobra de fato no fim do mês. */
  liquido: number;
  saidasPctEntradas: number;
  investPctEntradas: number;
  entradasPreenchidas: number;
  entradasLinhas: number;
  saidasCategorias: number;
}

export function budgetTotals(
  categories: Category[],
  orcado: Map<number, number>
): BudgetTotals {
  const ativas = categories.filter((c) => !c.archived);
  const soma = (kind: Category["kind"]) =>
    ativas
      .filter((c) => c.kind === kind)
      .reduce((sum, c) => sum + (orcado.get(c.id) ?? 0), 0);

  const entradas = soma("entrada");
  const saidas = soma("saida");
  const investimento = soma("investimento");
  const linhasEntrada = ativas.filter((c) => c.kind === "entrada");

  return {
    entradas,
    saidas,
    investimento,
    operacional: entradas - saidas,
    liquido: entradas - saidas - investimento,
    saidasPctEntradas: pctRaw(saidas, entradas),
    investPctEntradas: pctRaw(investimento, entradas),
    entradasPreenchidas: linhasEntrada.filter((c) => (orcado.get(c.id) ?? 0) > 0).length,
    entradasLinhas: linhasEntrada.length,
    saidasCategorias: ativas.filter(
      (c) => c.kind === "saida" && (orcado.get(c.id) ?? 0) > 0
    ).length,
  };
}
```

- [ ] **Step 1.4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/lib/budget.test.ts && npx tsc --noEmit`
Expected: 13 testes PASS; tsc limpo.

- [ ] **Step 1.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/lib/budget.ts frontend/src/lib/budget.test.ts
git commit -m "feat(ui): budget computation module"
```

---

### Task 2: Botão "Copiar de…" e strip de KPIs

**Files:**
- Create: `frontend/src/components/budget/CopyFromButton.tsx`
- Create: `frontend/src/components/budget/BudgetKpis.tsx`
- Modify: `frontend/src/styles/pages.css`

- [ ] **Step 2.1: `CopyFromButton`**

Create `frontend/src/components/budget/CopyFromButton.tsx`:

```tsx
import { addMonths, lastNMonths, monthLabel } from "../../lib/months";

/**
 * Mesmo truque do CategoryChip: o visual é um botão, mas quem abre a lista é um
 * `<select>` nativo transparente por cima — teclado e leitor de tela de graça.
 */
export default function CopyFromButton({
  month,
  disabled,
  onCopy,
}: {
  month: string;
  disabled: boolean;
  onCopy: (fromMonth: string) => void;
}) {
  const anteriores = lastNMonths(addMonths(month, -1), 12).reverse();
  const seguintes = Array.from({ length: 12 }, (_, i) => addMonths(month, i + 1));

  return (
    <span className={`copy-from${disabled ? " is-disabled" : ""}`}>
      <span>Copiar de…</span>
      <span aria-hidden="true">⌄</span>
      <select
        className="copy-from-select"
        aria-label="Copiar orçamento de outro mês"
        value=""
        disabled={disabled}
        onChange={(e) => {
          const from = e.target.value;
          e.target.value = "";
          if (!from) return;
          if (
            window.confirm(
              `Substituir o orçamento de ${monthLabel(month)} pelo de ${monthLabel(from)}?`
            )
          )
            onCopy(from);
        }}
      >
        <option value="">Copiar de…</option>
        <optgroup label="Meses anteriores">
          {anteriores.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </optgroup>
        <optgroup label="Meses seguintes">
          {seguintes.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </optgroup>
      </select>
    </span>
  );
}
```

> `e.target.value = ""` logo no início do handler: sem isso, cancelar o `confirm` deixa
> o `<select>` marcado no mês escolhido, e escolher o mesmo mês de novo não dispara
> `change`.

- [ ] **Step 2.2: `BudgetKpis`**

Create `frontend/src/components/budget/BudgetKpis.tsx`:

```tsx
import type { BudgetTotals } from "../../lib/budget";
import Money from "../Money";

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

export default function BudgetKpis({ t }: { t: BudgetTotals }) {
  return (
    <section className="kpi-strip budget-kpis">
      <div className="kpi">
        <div className="label">Entradas orçadas</div>
        <div className="kpi-value">
          <Money cents={t.entradas} tone="accent" />
        </div>
        <div className="kpi-note">
          {t.entradasPreenchidas} de {t.entradasLinhas} linhas preenchidas
        </div>
      </div>

      <div className="kpi">
        <div className="label">Saídas orçadas</div>
        <div className="kpi-value">
          <Money cents={t.saidas} />
        </div>
        <div className="kpi-note">
          {t.entradas > 0 ? `${Math.round(t.saidasPctEntradas)}% das entradas · ` : ""}
          {t.saidasCategorias} categorias
        </div>
      </div>

      <div className={t.operacional < 0 ? "kpi kpi--negativo" : "kpi"}>
        <div className="label">Saldo operacional</div>
        <div className="kpi-value">
          <Money cents={t.operacional} tone={t.operacional < 0 ? "over" : "accent"} />
        </div>
        <div className="kpi-note">entradas − saídas, sem investimento</div>
      </div>

      <div className="kpi kpi--invest">
        <div className="label kpi-label-dot">
          <span className="swatch tone-invest" />
          Aporte alvo
        </div>
        <div className="kpi-value">
          <Money cents={t.investimento} tone="invest" />
        </div>
        <div className="kpi-note">
          {t.entradas > 0 ? `${pct(t.investPctEntradas)} das entradas · ` : ""}não é gasto
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2.3: CSS**

Ao final de `frontend/src/styles/pages.css`:

```css
/* ---------- Orçamento ---------- */
.budget-kpis {
  grid-template-columns: 1fr 1fr 1.15fr 1fr;
}

.budget-kpis .kpi-value .money {
  font-size: 22px;
}

.kpi--negativo {
  background: var(--tint-over);
}

.copy-from {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  padding: 7px 12px;
  border-radius: var(--r-control);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--ink-2);
  cursor: pointer;
}

.copy-from:hover {
  background: var(--hover-ghost);
  color: var(--ink);
}

.copy-from:focus-within {
  border-color: var(--focus);
}

.copy-from.is-disabled {
  opacity: 0.6;
  cursor: default;
}

.copy-from-select {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  border: 0;
  padding: 0;
  cursor: inherit;
}
```

- [ ] **Step 2.4: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: limpo. (Componentes ainda não usados — entram na Task 6.)

- [ ] **Step 2.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/budget frontend/src/styles/pages.css
git commit -m "feat(ui): budget kpi strip and copy-from control"
```

---

### Task 3: Card "Saídas" em duas colunas

**Files:**
- Create: `frontend/src/components/budget/ExpensesCard.tsx`
- Modify: `frontend/src/styles/pages.css`

- [ ] **Step 3.1: Criar o componente**

Create `frontend/src/components/budget/ExpensesCard.tsx`:

```tsx
import type { BudgetLineRow, BudgetSort, BudgetView } from "../../lib/budget";
import { formatBRL } from "../../lib/money";
import BudgetInput from "../BudgetInput";
import Segmented from "../Segmented";

const SORT_OPTIONS = [
  { value: "valor" as const, label: "Maior valor" },
  { value: "nome" as const, label: "A → Z" },
];

export default function ExpensesCard({
  view,
  sort,
  onSort,
  onSave,
}: {
  view: BudgetView;
  sort: BudgetSort;
  onSort: (s: BudgetSort) => void;
  onSave: (categoryId: number, cents: number) => void;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Saídas</h2>
          <div className="sub">barra = peso da categoria no orçamento de saídas</div>
        </div>
        <Segmented
          value={sort}
          options={SORT_OPTIONS}
          onChange={onSort}
          ariaLabel="Ordenar as saídas"
        />
      </div>

      <div className="budget-grid">
        {view.comOrcamento.map((r) => (
          <Linha key={r.id} r={r} onSave={onSave} />
        ))}
      </div>

      {view.semOrcamento.length > 0 && (
        <div className="budget-sem-orcamento">
          <div className="label">Sem orçamento definido</div>
          <div className="budget-grid">
            {view.semOrcamento.map((r) => (
              <Linha key={r.id} r={r} onSave={onSave} vazia />
            ))}
          </div>
        </div>
      )}

      <div className="budget-total">
        <span>Total das saídas</span>
        <span className="mono">{formatBRL(view.total)}</span>
      </div>
    </div>
  );
}

function Linha({
  r,
  onSave,
  vazia = false,
}: {
  r: BudgetLineRow;
  onSave: (categoryId: number, cents: number) => void;
  vazia?: boolean;
}) {
  const alerta = vazia && r.jaGasto > 0;
  return (
    <div className={vazia ? "budget-row budget-row--vazia" : "budget-row"}>
      <div className="budget-row-main">
        <div className="budget-row-name">
          {r.nome}
          {alerta && (
            <span className="budget-row-gasto tone-warn mono">
              {formatBRL(r.jaGasto)} já gastos
            </span>
          )}
        </div>
        {!vazia && (
          <div className="budget-peso">
            <span
              className={r.destaque ? "budget-peso-fill is-forte" : "budget-peso-fill"}
              style={{ width: `${r.pesoPct}%` }}
            />
          </div>
        )}
      </div>
      <BudgetInput
        cents={r.cents}
        width={108}
        className={alerta ? "mono dashed budget-input-alerta" : vazia ? "mono dashed" : "mono"}
        ariaLabel={`Orçamento de ${r.nome}`}
        onSave={(cents) => onSave(r.id, cents)}
      />
    </div>
  );
}
```

- [ ] **Step 3.2: `BudgetInput` aceita `className`**

O design precisa de borda tracejada nas linhas sem valor e de mono nos números. Em
`frontend/src/components/BudgetInput.tsx`, substituir a assinatura (linhas 5-15) por:

```tsx
export default function BudgetInput({
  cents,
  onSave,
  width = 110,
  ariaLabel,
  className,
}: {
  cents: number;
  onSave: (c: number) => void;
  width?: number;
  ariaLabel?: string;
  className?: string;
}) {
```

E, no `<input>`, acrescentar `className={className}` logo antes de `aria-label`.

- [ ] **Step 3.3: CSS**

Ao final da seção "Orçamento" de `frontend/src/styles/pages.css`:

```css
/* Duas colunas de categorias: 22 linhas numa coluna só viraria uma rolagem enorme. */
.budget-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 26px;
}

.budget-row {
  display: grid;
  grid-template-columns: 1fr 108px;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--divider);
}

.budget-row--vazia {
  padding: 7px 0;
}

.budget-row-main {
  min-width: 0;
}

.budget-row-name {
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.budget-row--vazia .budget-row-name {
  color: var(--muted);
}

.budget-row-gasto {
  font-size: 10px;
  margin-left: 6px;
}

.budget-peso {
  margin-top: 6px;
  height: 3px;
  border-radius: var(--r-pill);
  background: var(--track);
}

.budget-peso-fill {
  display: block;
  height: 100%;
  border-radius: var(--r-pill);
  background: var(--accent);
  opacity: 0.4;
}

.budget-peso-fill.is-forte {
  opacity: 1;
}

.budget-sem-orcamento {
  margin-top: 16px;
  padding-top: 13px;
  border-top: 1px solid var(--border);
}

.budget-sem-orcamento .label {
  margin-bottom: 8px;
}

/* Categoria sem orçamento mas com gasto: a borda avisa antes do número. */
.budget-input-alerta {
  border-color: var(--warn);
}

.budget-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-strong);
  font-size: 13px;
  font-weight: 600;
}

.budget-total .mono {
  font-size: 16px;
  font-weight: 500;
}
```

- [ ] **Step 3.4: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: tudo verde.

- [ ] **Step 3.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/budget frontend/src/components/BudgetInput.tsx frontend/src/styles/pages.css
git commit -m "feat(ui): budget expenses card with weight bars"
```

---

### Task 4: Rail direito grudado

**Files:**
- Create: `frontend/src/components/budget/BudgetRail.tsx`
- Modify: `frontend/src/styles/pages.css`

- [ ] **Step 4.1: Criar o componente**

Create `frontend/src/components/budget/BudgetRail.tsx`:

```tsx
import type { Category } from "../../api/types";
import type { BudgetTotals } from "../../lib/budget";
import { formatBRL } from "../../lib/money";
import { monthLabel } from "../../lib/months";
import { pctOf } from "../../lib/pct";
import BudgetInput from "../BudgetInput";
import Money from "../Money";
import ProgressBar from "../ProgressBar";

export default function BudgetRail({
  month,
  entradas,
  investimentos,
  orcado,
  investRealizado,
  totals,
  onSave,
}: {
  month: string;
  entradas: Category[];
  investimentos: Category[];
  orcado: Map<number, number>;
  /** Líquido investido no mês (com sinal), vindo do summary. */
  investRealizado: number;
  totals: BudgetTotals;
  onSave: (categoryId: number, cents: number) => void;
}) {
  const pctMeta = pctOf(investRealizado, totals.investimento);

  return (
    <div className="budget-rail">
      <div className="card">
        <h2>Entradas</h2>
        <div className="budget-rail-rows">
          {entradas.map((c) => {
            const cents = orcado.get(c.id) ?? 0;
            return (
              <div key={c.id} className="budget-rail-row">
                <span className={cents > 0 ? undefined : "tone-muted"}>{c.name}</span>
                <BudgetInput
                  cents={cents}
                  width={112}
                  className={cents > 0 ? "mono" : "mono dashed"}
                  ariaLabel={`Orçamento de ${c.name}`}
                  onSave={(v) => onSave(c.id, v)}
                />
              </div>
            );
          })}
        </div>
        <div className="budget-rail-total">
          <span>Total</span>
          <Money cents={totals.entradas} tone="accent" />
        </div>
      </div>

      <div className="card budget-invest-card">
        <div className="budget-invest-head">
          <span className="swatch tone-invest" />
          <h2>Investimentos</h2>
        </div>
        <p className="note">
          Meta de aporte. Move patrimônio, não é despesa — fica fora do total de saídas.
        </p>
        <div className="budget-rail-rows">
          {investimentos.map((c) => (
            <div key={c.id} className="budget-rail-row">
              <span>{c.name}</span>
              <BudgetInput
                cents={orcado.get(c.id) ?? 0}
                width={112}
                className="mono invest"
                ariaLabel={`Meta de aporte de ${c.name}`}
                onSave={(v) => onSave(c.id, v)}
              />
            </div>
          ))}
          {investimentos.length === 0 && (
            <p className="muted">Nenhuma categoria de investimento.</p>
          )}
        </div>
        <div className="budget-rail-total budget-invest-real">
          <span className="tone-muted">Realizado em {monthLabel(month)}</span>
          <Money cents={investRealizado} alwaysSign tone="invest" />
        </div>
        <div className="budget-invest-bar">
          <ProgressBar
            pct={pctMeta}
            tone="invest"
            height={5}
            ariaLabel="Aporte realizado sobre a meta"
          />
        </div>
        <div className="sub">
          {totals.investimento > 0 ? `${Math.round(pctMeta)}% da meta do mês` : "sem meta definida"}
        </div>
      </div>

      <div className="card">
        <h2>Como o mês fecha</h2>
        <div className="budget-fecha">
          <div>
            <span className="tone-muted">Entradas</span>
            <Money cents={totals.entradas} alwaysSign tone="accent" />
          </div>
          <div>
            <span className="tone-muted">Saídas</span>
            <Money cents={-totals.saidas} />
          </div>
          <div className="budget-fecha-sub">
            <span>Operacional</span>
            <Money
              cents={totals.operacional}
              alwaysSign
              tone={totals.operacional < 0 ? "over" : "accent"}
            />
          </div>
          <div>
            <span className="tone-muted">Aporte planejado</span>
            <Money cents={-totals.investimento} tone="invest" />
          </div>
          <div className="budget-fecha-total">
            <span>Saldo líquido</span>
            <Money
              cents={totals.liquido}
              alwaysSign
              tone={totals.liquido < 0 ? "over" : "accent"}
            />
          </div>
        </div>
        <p className="note">
          {totals.operacional < 0
            ? `O orçamento não fecha antes do aporte: são ${formatBRL(-totals.operacional)} a cortar nas saídas.`
            : totals.liquido < 0
              ? `O operacional fecha, mas o aporte de ${formatBRL(totals.investimento)} não cabe — sobra ${formatBRL(totals.operacional)}.`
              : "O orçamento fecha com folga, já contando o aporte planejado."}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.2: CSS**

Ao final da seção "Orçamento" de `frontend/src/styles/pages.css`:

```css
.budget-rail {
  display: flex;
  flex-direction: column;
  gap: var(--gap-section);
  position: sticky;
  top: 20px;
}

.budget-rail .card {
  margin-bottom: 0;
}

.budget-rail-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.budget-rail-row {
  display: grid;
  grid-template-columns: 1fr 112px;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
}

.budget-rail-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 12.5px;
  font-weight: 600;
}

.budget-invest-card {
  border-color: var(--invest-border);
}

.budget-invest-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.budget-invest-real {
  font-weight: 400;
}

.budget-invest-bar {
  margin-top: 9px;
  margin-bottom: 6px;
}

.budget-fecha {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  font-size: 12.5px;
}

.budget-fecha > div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.budget-fecha-sub,
.budget-fecha-total {
  font-weight: 600;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 4.3: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: tudo verde.

- [ ] **Step 4.4: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/budget frontend/src/styles/pages.css
git commit -m "feat(ui): sticky budget rail with income, investment and closing"
```

---

### Task 5: Histórico real vs. orçado

**Files:**
- Create: `frontend/src/components/budget/BudgetHistoryCard.tsx`
- Modify: `frontend/src/styles/pages.css`

- [ ] **Step 5.1: Criar o componente**

Create `frontend/src/components/budget/BudgetHistoryCard.tsx`:

```tsx
import { useSummaries } from "../../api/hooks";
import type { RealOrc } from "../../api/types";
import { formatK } from "../../lib/money";
import { lastNMonths, monthLabel } from "../../lib/months";
import type { Tone } from "../../lib/tone";

const N_MESES = 6;

export default function BudgetHistoryCard({ month }: { month: string }) {
  const months = lastNMonths(month, N_MESES);
  const results = useSummaries(months);
  const error = results.find((r) => r.error)?.error;

  return (
    <div className="card">
      <div className="budget-hist-head">
        <h2>Histórico — real vs. orçado</h2>
        <span className="sub">investimento em coluna própria</span>
      </div>

      {error && <p className="error">Erro ao carregar o histórico: {(error as Error).message}</p>}

      <div className="budget-hist">
        <div className="budget-hist-row budget-hist-head-row">
          <div>Mês</div>
          <div>Entradas</div>
          <div>Saídas</div>
          <div>Investido</div>
          <div>Saldo</div>
        </div>
        {months.map((m, i) => {
          const s = results[i].data;
          const atual = i === months.length - 1;
          return (
            <div
              key={m}
              className={atual ? "budget-hist-row is-current" : "budget-hist-row"}
            >
              <div className="mono tone-ink-2">{monthLabel(m)}</div>
              {s ? (
                <>
                  <Celula v={s.entradas} />
                  <Celula v={s.saidas} />
                  <Celula v={s.investimentos} tone={s.investimentos.real < 0 ? "over" : "invest"} />
                  <Celula v={s.saldo} tone={s.saldo.real < 0 ? "over" : "accent"} />
                </>
              ) : (
                <>
                  <div className="mono tone-muted">…</div>
                  <div className="mono tone-muted">…</div>
                  <div className="mono tone-muted">…</div>
                  <div className="mono tone-muted">…</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="note budget-hist-note">
        Meses com investido negativo tiveram resgate líquido — o saldo positivo nesses meses
        vem do resgate, não de sobra de renda.
      </p>
    </div>
  );
}

/** `4.599 / 55.217` — realizado em destaque, orçado em cinza, ambos compactos. */
function Celula({ v, tone }: { v: RealOrc; tone?: Tone }) {
  return (
    <div className="mono">
      <span className={v.real !== 0 && tone ? `tone-${tone}` : undefined}>
        {formatK(v.real)}
      </span>
      <span className="tone-muted"> / {formatK(v.orcado)}</span>
    </div>
  );
}
```

- [ ] **Step 5.2: CSS**

Ao final da seção "Orçamento" de `frontend/src/styles/pages.css`:

```css
.budget-hist-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.budget-hist-row {
  display: grid;
  grid-template-columns: 64px repeat(4, 1fr);
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--divider);
  font-size: 12.5px;
  align-items: baseline;
}

.budget-hist-row > div:not(:first-child) {
  text-align: right;
}

.budget-hist-head-row {
  padding: 12px 0 7px;
  font-size: 10px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}

.budget-hist-row.is-current {
  background: var(--tint-accent);
  border-bottom: 0;
  border-radius: 0 0 var(--r-control) var(--r-control);
  font-weight: 500;
}

.budget-hist-note {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 5.3: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: tudo verde.

- [ ] **Step 5.4: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/budget frontend/src/styles/pages.css
git commit -m "feat(ui): budget history card"
```

---

### Task 6: Reescrita da página e verificação final

**Files:**
- Modify: `frontend/src/pages/Budget.tsx`, `frontend/src/styles/pages.css`

- [ ] **Step 6.1: Reescrever a página**

Substituir todo o conteúdo de `frontend/src/pages/Budget.tsx` por:

```tsx
import { useMemo, useState } from "react";

import {
  useBudgets,
  useCategories,
  useCopyBudget,
  usePutBudget,
  useSummary,
} from "../api/hooks";
import BudgetHistoryCard from "../components/budget/BudgetHistoryCard";
import BudgetKpis from "../components/budget/BudgetKpis";
import BudgetRail from "../components/budget/BudgetRail";
import CopyFromButton from "../components/budget/CopyFromButton";
import ExpensesCard from "../components/budget/ExpensesCard";
import MonthPicker from "../components/MonthPicker";
import PageHeader from "../components/PageHeader";
import { budgetTotals, expenseRows, type BudgetSort } from "../lib/budget";
import { currentMonth, monthLabel, monthTitle } from "../lib/months";

export default function Budget() {
  const [month, setMonth] = useState(currentMonth());
  const [sort, setSort] = useState<BudgetSort>("valor");

  const { data: lines } = useBudgets(month);
  const { data: categories } = useCategories();
  // O realizado entra aqui por causa de dois pontos do design: "R$ 93 já gastos" nas
  // categorias sem orçamento e "Realizado em ago" no card de investimentos.
  const { data: summary } = useSummary(month);
  const putBudget = usePutBudget();
  const copyBudget = useCopyBudget();

  const orcado = useMemo(
    () => new Map((lines ?? []).map((l) => [l.category_id, l.amount_cents])),
    [lines]
  );
  const real = useMemo(
    () => new Map((summary?.categorias ?? []).map((c) => [c.id, c.real])),
    [summary]
  );

  const ativas = useMemo(
    () => (categories ?? []).filter((c) => !c.archived),
    [categories]
  );
  const view = useMemo(
    () => expenseRows(ativas, orcado, real, sort),
    [ativas, orcado, real, sort]
  );
  const totals = useMemo(() => budgetTotals(ativas, orcado), [ativas, orcado]);

  const salvar = (categoryId: number, cents: number) =>
    putBudget.mutate({ category_id: categoryId, amount_cents: cents, valid_from: month });

  return (
    <>
      <PageHeader
        eyebrow="Orçamento"
        title={monthTitle(month)}
        subtitle={`Valores valem a partir de ${monthLabel(month)} até você mudar de novo. Meses passados mantêm o valor que vigorava na época.`}
      >
        <CopyFromButton
          month={month}
          disabled={copyBudget.isPending}
          onCopy={(from) => copyBudget.mutate({ from_month: from, to_month: month })}
        />
        <MonthPicker month={month} onChange={setMonth} />
      </PageHeader>

      <BudgetKpis t={totals} />

      <section className="budget-grid-main">
        <ExpensesCard view={view} sort={sort} onSort={setSort} onSave={salvar} />
        <BudgetRail
          month={month}
          entradas={ativas.filter((c) => c.kind === "entrada")}
          investimentos={ativas.filter((c) => c.kind === "investimento")}
          orcado={orcado}
          investRealizado={summary?.investimentos.real ?? 0}
          totals={totals}
          onSave={salvar}
        />
      </section>

      <BudgetHistoryCard month={month} />
    </>
  );
}
```

- [ ] **Step 6.2: CSS do grid principal**

Ao final da seção "Orçamento" de `frontend/src/styles/pages.css`:

```css
.budget-grid-main {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--gap-section);
  align-items: start;
  margin-bottom: var(--gap-section);
}

/* Janela estreita: rail abaixo e categorias numa coluna só. */
@media (max-width: 1180px) {
  .budget-grid-main {
    grid-template-columns: 1fr;
  }

  .budget-grid {
    grid-template-columns: 1fr;
  }

  .budget-rail {
    position: static;
  }
}
```

- [ ] **Step 6.3: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint && npm run build`
Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: tudo PASS; backend `110 passed` (intocado).

> `npm run build` não é opcional: o app é acessado em `localhost:8000`, onde o FastAPI
> serve `frontend/dist`.

- [ ] **Step 6.4: Verificação visual (skill webapp-testing)**

Em `http://localhost:5173/#/orcamento`:

1. **Header:** eyebrow "Orçamento", h1 "Agosto 2026", subtítulo de vigência, botão
   "Copiar de… ⌄" e seletor de mês.
2. **KPIs:** 4 colunas; Saldo operacional negativo com fundo avermelhado e valor em
   vermelho; Aporte alvo em lilás com o quadradinho.
3. **Saídas:** duas colunas de categorias; barras de peso (a maior cheia, as pequenas
   translúcidas); segmented "Maior valor"/"A → Z" reordena; bloco "Sem orçamento
   definido" com inputs tracejados; "Impostos & Taxas" com o aviso de valor já gasto e
   borda âmbar; "Total das saídas" batendo com o KPI.
4. **Rail:** gruda ao rolar; Entradas com tracejado nas linhas vazias e total em teal;
   Investimentos com borda lilás, barra e "% da meta"; "Como o mês fecha" com
   Operacional e Saldo líquido, e a nota explicando o que falta cortar.
5. **Editar** um valor de saída e confirmar que Total, KPIs e "Como o mês fecha"
   recalculam sem recarregar a página.
6. **Copiar de…** abre a lista com meses anteriores e seguintes; cancelar o confirm não
   deixa o controle preso no mês escolhido (abrir de novo e escolher o mesmo mês deve
   funcionar).
7. **Histórico:** 6 linhas, mês corrente destacado, investido negativo em vermelho.
8. Screenshot em dark e em light; console sem erros.

- [ ] **Step 6.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/pages/Budget.tsx frontend/src/styles/pages.css
git commit -m "feat(ui): redesigned budget page"
```

- [ ] **Step 6.6: Revisão de código**

Usar a skill code-review sobre o conjunto de commits deste plano (preferência do usuário:
sem revisor por task, uma revisão ao final).
