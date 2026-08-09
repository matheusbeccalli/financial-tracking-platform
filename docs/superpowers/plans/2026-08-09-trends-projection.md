# Página "Tendências e Projeção" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova página com matriz categorias × meses — 6 passados (realizado), coluna média 6m, mês atual + 6 futuros (orçamento vigente, editável) — com linhas de saldo e de fluxo de caixa acumulado, conforme `docs/superpowers/specs/2026-08-09-trends-projection-design.md`.

**Architecture:** Frontend puro, zero backend novo: `month_summary` já responde qualquer mês (futuro ⇒ `real=0` + orçamento vigente + `saldo.orcado`), então a matriz inteira é `useSummaries(13 meses)`. Os cálculos (média, totais, saldo, acumulado, marcador "otimista") vivem num módulo puro `lib/trends.ts` testado com vitest. Edição de célula reusa `usePutBudget` com `valid_from` = mês da coluna; a invalidação global refaz tudo. O `BudgetInput` sai de `Budget.tsx` para componente compartilhado.

**Tech Stack:** React + TypeScript + TanStack Query, vitest. Sem mudanças em FastAPI/pytest.

**Nota de leve desvio do spec:** o spec menciona células "…" durante carregamento; na prática a página mostra "Carregando…" até os 13 summaries chegarem (padrão do `KpiRow`) — evita matriz parcial, e após edições o react-query mantém os dados antigos visíveis durante o refetch, então "…" nunca apareceria por célula. A média 6m também é exibida na linha "Saldo do mês" (é uma linha de total no sentido do spec).

---

### Task 1: Extrair `BudgetInput` para componente compartilhado

**Files:**
- Create: `frontend/src/components/BudgetInput.tsx`
- Modify: `frontend/src/pages/Budget.tsx` (remover o componente local, ajustar imports)

- [ ] **Step 1.1: Criar o componente**

Create `frontend/src/components/BudgetInput.tsx` (é o componente que hoje vive em `Budget.tsx:132-150`, com um prop `width` novo, default preservando o comportamento atual):

```tsx
import { useEffect, useState } from "react";

import { parseBRL } from "../lib/money";

export default function BudgetInput({
  cents,
  onSave,
  width = 110,
}: {
  cents: number;
  onSave: (c: number) => void;
  width?: number;
}) {
  const toText = (c: number) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");
  const [text, setText] = useState(toText(cents));
  useEffect(() => setText(toText(cents)), [cents]);
  const commit = () => {
    const parsed = text.trim() === "" ? 0 : parseBRL(text);
    if (parsed !== null && parsed >= 0 && parsed !== cents) onSave(parsed);
  };
  return (
    <input
      style={{ width, textAlign: "right" }}
      value={text}
      placeholder="0,00"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
```

- [ ] **Step 1.2: Usar o componente em `Budget.tsx`**

Em `frontend/src/pages/Budget.tsx`:

1. Apagar a função local `BudgetInput` (linhas 132-150).
2. Adicionar o import (junto aos imports de components):

```tsx
import BudgetInput from "../components/BudgetInput";
```

3. Ajustar imports que ficaram órfãos: no import do React, trocar
   `import { useEffect, useState } from "react";` por `import { useState } from "react";`
   (o `useState` continua em uso no componente `Budget`); no import de money, trocar
   `import { formatBRL, parseBRL } from "../lib/money";` por
   `import { formatBRL } from "../lib/money";`.

- [ ] **Step 1.3: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: sem erros; 31 testes passam (nenhum teste referencia o BudgetInput diretamente).

- [ ] **Step 1.4: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/BudgetInput.tsx frontend/src/pages/Budget.tsx
git commit -m "refactor(ui): extract BudgetInput into shared component"
```

(Este repositório NÃO usa linha de Co-Authored-By em commits.)

---

### Task 2: Módulo puro `lib/trends.ts` (TDD)

**Files:**
- Create: `frontend/src/lib/trends.ts`
- Test: `frontend/src/lib/trends.test.ts`

- [ ] **Step 2.1: Escrever os testes (vão falhar — módulo não existe)**

Create `frontend/src/lib/trends.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Category, CategoryKind, Summary } from "../api/types";
import { buildTrends, otimista, trendsWindow } from "./trends";

const cat = (id: number, name: string, kind: CategoryKind): Category => ({
  id,
  name,
  kind,
  color: "#8888aa",
  archived: false,
});

const line = (id: number, kind: CategoryKind, real = 0, orcado = 0) => ({
  id,
  nome: `cat${id}`,
  kind,
  real,
  orcado,
});

function mkSummary(
  month: string,
  opts: {
    categorias?: Summary["categorias"];
    entradas?: [number, number];
    saidas?: [number, number];
    investimentos?: [number, number];
    saldo?: [number, number];
  } = {}
): Summary {
  const ro = ([real, orcado]: [number, number] = [0, 0]) => ({ real, orcado });
  return {
    month,
    entradas: ro(opts.entradas),
    saidas: ro(opts.saidas),
    investimentos: ro(opts.investimentos),
    saldo: ro(opts.saldo),
    ritmo: null,
    categorias: opts.categorias ?? [],
  };
}

const CATS = [cat(2, "Salário", "entrada"), cat(1, "Mercado", "saida"), cat(3, "Investimentos", "investimento")];

describe("trendsWindow", () => {
  it("monta 6 passados e atual+6 futuros, atravessando a virada de ano", () => {
    const w = trendsWindow("2026-01");
    expect(w.pastMonths).toEqual([
      "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12",
    ]);
    expect(w.planMonths).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
    ]);
  });
});

describe("buildTrends", () => {
  it("média trata mês sem movimento como zero", () => {
    const s1 = mkSummary("2026-01", { categorias: [line(1, "saida", 100000)] });
    const s2 = mkSummary("2026-02"); // Mercado sem movimento
    const p1 = mkSummary("2026-03");
    const m = buildTrends(2, [s1, s2, p1], CATS);
    expect(m.rows.saida[0].past).toEqual([100000, 0]);
    expect(m.rows.saida[0].media).toBe(50000);
  });

  it("plan usa o orçado vigente de cada mês", () => {
    const s1 = mkSummary("2026-01");
    const p1 = mkSummary("2026-02", { categorias: [line(1, "saida", 0, 120000)] });
    const p2 = mkSummary("2026-03", { categorias: [line(1, "saida", 0, 90000)] });
    const m = buildTrends(1, [s1, p1, p2], CATS);
    expect(m.rows.saida[0].plan).toEqual([120000, 90000]);
  });

  it("investimento mantém o sinal no realizado e na média", () => {
    const s1 = mkSummary("2026-01", { categorias: [line(3, "investimento", -50000)] });
    const s2 = mkSummary("2026-02", { categorias: [line(3, "investimento", 150000)] });
    const p1 = mkSummary("2026-03");
    const m = buildTrends(2, [s1, s2, p1], CATS);
    expect(m.rows.investimento[0].past).toEqual([-50000, 150000]);
    expect(m.rows.investimento[0].media).toBe(50000);
  });

  it("totais vêm dos blocos do summary (incluem não categorizadas)", () => {
    const s1 = mkSummary("2026-01", { entradas: [850000, 0] }); // sem linha por categoria
    const p1 = mkSummary("2026-02", { entradas: [0, 900000] });
    const m = buildTrends(1, [s1, p1], CATS);
    expect(m.totals.entrada.past).toEqual([850000]);
    expect(m.totals.entrada.media).toBe(850000);
    expect(m.totals.entrada.plan).toEqual([900000]);
  });

  it("saldo usa real no passado e orçado no plano; acumulado soma o plano", () => {
    const s1 = mkSummary("2026-01", { saldo: [123, 456] });
    const p1 = mkSummary("2026-02", { saldo: [0, 100000] });
    const p2 = mkSummary("2026-03", { saldo: [0, -150000] });
    const p3 = mkSummary("2026-04", { saldo: [0, 20000] });
    const m = buildTrends(1, [s1, p1, p2, p3], CATS);
    expect(m.saldoPast).toEqual([123]);
    expect(m.saldoMedia).toBe(123);
    expect(m.saldoPlan).toEqual([100000, -150000, 20000]);
    expect(m.acumulado).toEqual([100000, -50000, -30000]);
  });

  it("categoria arquivada fica fora das linhas", () => {
    const arch = { ...cat(9, "Velha", "saida"), archived: true };
    const m = buildTrends(1, [mkSummary("2026-01"), mkSummary("2026-02")], [arch]);
    expect(m.rows.saida).toEqual([]);
  });
});

describe("otimista", () => {
  it("saída orçada bem abaixo da média é otimista", () => {
    expect(otimista("saida", 100000, 80000)).toBe(true);
    expect(otimista("saida", 100000, 95000)).toBe(false);
  });

  it("entrada/investimento orçados bem acima da média são otimistas", () => {
    expect(otimista("entrada", 100000, 120000)).toBe(true);
    expect(otimista("investimento", 100000, 105000)).toBe(false);
  });

  it("sem média positiva não marca", () => {
    expect(otimista("saida", 0, 50000)).toBe(false);
    expect(otimista("investimento", -20000, 50000)).toBe(false);
  });
});
```

- [ ] **Step 2.2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/trends.test.ts`
Expected: FAIL — `Cannot find module './trends'`.

- [ ] **Step 2.3: Implementar o módulo**

Create `frontend/src/lib/trends.ts`:

```ts
import type { Category, CategoryKind, Summary } from "../api/types";
import { addMonths, lastNMonths } from "./months";

// Matriz da página Tendências e Projeção: passado = realizado, plano = orçado vigente.
// Valores de investimento são o líquido com sinal (positivo = aportou mais que resgatou).
export interface TrendsRow {
  id: number;
  nome: string;
  kind: CategoryKind;
  past: number[];
  media: number;
  plan: number[];
}

export interface TrendsTotals {
  past: number[];
  media: number;
  plan: number[];
}

export interface TrendsMatrix {
  rows: Record<CategoryKind, TrendsRow[]>;
  totals: Record<CategoryKind, TrendsTotals>;
  saldoPast: number[];
  saldoMedia: number;
  saldoPlan: number[];
  acumulado: number[]; // soma corrente de saldoPlan, começando no mês atual
}

const KINDS: CategoryKind[] = ["entrada", "saida", "investimento"];
const BLOCK: Record<CategoryKind, "entradas" | "saidas" | "investimentos"> = {
  entrada: "entradas",
  saida: "saidas",
  investimento: "investimentos",
};

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function trendsWindow(today: string): { pastMonths: string[]; planMonths: string[] } {
  return {
    pastMonths: lastNMonths(addMonths(today, -1), 6),
    planMonths: Array.from({ length: 7 }, (_, i) => addMonths(today, i)),
  };
}

export function buildTrends(
  nPast: number,
  summaries: Summary[],
  categories: Category[]
): TrendsMatrix {
  const past = summaries.slice(0, nPast);
  const plan = summaries.slice(nPast);
  const line = (s: Summary, id: number) => s.categorias.find((c) => c.id === id);

  const rows = {} as Record<CategoryKind, TrendsRow[]>;
  const totals = {} as Record<CategoryKind, TrendsTotals>;
  for (const kind of KINDS) {
    rows[kind] = categories
      .filter((c) => !c.archived && c.kind === kind)
      .map((c) => {
        const pastVals = past.map((s) => line(s, c.id)?.real ?? 0);
        return {
          id: c.id,
          nome: c.name,
          kind,
          past: pastVals,
          media: media(pastVals),
          plan: plan.map((s) => line(s, c.id)?.orcado ?? 0),
        };
      });
    const pastTotals = past.map((s) => s[BLOCK[kind]].real);
    totals[kind] = {
      past: pastTotals,
      media: media(pastTotals),
      plan: plan.map((s) => s[BLOCK[kind]].orcado),
    };
  }

  const saldoPast = past.map((s) => s.saldo.real);
  const saldoPlan = plan.map((s) => s.saldo.orcado);
  const acumulado: number[] = [];
  saldoPlan.reduce((acc, v) => {
    acumulado.push(acc + v);
    return acc + v;
  }, 0);

  return { rows, totals, saldoPast, saldoMedia: media(saldoPast), saldoPlan, acumulado };
}

// Orçamento "otimista" vs. a média realizada: planejar gastar bem menos (saída) ou
// receber/aportar bem mais (entrada/investimento) do que vem acontecendo. Tolerância
// de 10% para não marcar ruído.
export function otimista(kind: CategoryKind, media6m: number, plano: number): boolean {
  if (media6m <= 0) return false;
  const ratio = plano / media6m;
  return kind === "saida" ? ratio < 0.9 : ratio > 1.1;
}
```

- [ ] **Step 2.4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/lib/trends.test.ts && npx tsc --noEmit`
Expected: 10 testes PASS; tsc limpo.

- [ ] **Step 2.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/lib/trends.ts frontend/src/lib/trends.test.ts
git commit -m "feat(ui): trends matrix computation module"
```

---

### Task 3: Página `Trends.tsx`, rota, sidebar e CSS

**Files:**
- Create: `frontend/src/pages/Trends.tsx`
- Modify: `frontend/src/App.tsx` (rota), `frontend/src/components/Layout.tsx` (link), `frontend/src/styles.css` (final do arquivo)

- [ ] **Step 3.1: Criar a página**

Create `frontend/src/pages/Trends.tsx`:

```tsx
import { useCategories, usePutBudget, useSummaries } from "../api/hooks";
import type { CategoryKind, Summary } from "../api/types";
import BudgetInput from "../components/BudgetInput";
import { formatBRL } from "../lib/money";
import { currentMonth, monthLabel } from "../lib/months";
import {
  buildTrends,
  otimista,
  trendsWindow,
  type TrendsRow,
  type TrendsTotals,
} from "../lib/trends";

const KIND_LABELS: Record<CategoryKind, string> = {
  entrada: "Entradas",
  saida: "Saídas",
  investimento: "Investimentos",
};

export default function Trends() {
  const { pastMonths, planMonths } = trendsWindow(currentMonth());
  const results = useSummaries([...pastMonths, ...planMonths]);
  const { data: categories } = useCategories();
  const putBudget = usePutBudget();
  const summaries = results.map((r) => r.data);
  const nCols = pastMonths.length + planMonths.length + 2; // rótulo + média

  if (!categories || summaries.some((s) => s === undefined))
    return (
      <>
        <h2>Tendências e Projeção</h2>
        <p className="muted">Carregando…</p>
      </>
    );

  const m = buildTrends(pastMonths.length, summaries as Summary[], categories);
  const save = (categoryId: number, cents: number, month: string) =>
    putBudget.mutate({ category_id: categoryId, amount_cents: cents, valid_from: month });

  return (
    <>
      <h2>Tendências e Projeção</h2>
      <p className="muted">
        Passado mostra o realizado; mês atual e seguintes mostram o orçamento vigente —
        valores salvos valem a partir do mês da coluna até você mudar de novo.
      </p>
      <div className="card trends-wrap">
        <table>
          <thead>
            <tr>
              <th className="sticky"></th>
              {pastMonths.map((mo) => (
                <th key={mo} className="num">
                  {monthLabel(mo)}
                </th>
              ))}
              <th className="num">média 6m</th>
              {planMonths.map((mo, i) => (
                <th key={mo} className={i === 0 ? "num cur" : "num"}>
                  {monthLabel(mo)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["entrada", "saida", "investimento"] as const).map((kind) => (
              <SectionRows
                key={kind}
                kind={kind}
                rows={m.rows[kind]}
                totals={m.totals[kind]}
                planMonths={planMonths}
                nCols={nCols}
                onSave={save}
              />
            ))}
            <tr>
              <td className="sticky">
                <b>Saldo do mês</b>
              </td>
              {m.saldoPast.map((v, i) => (
                <Money key={i} v={v} tone />
              ))}
              <td className="num muted">
                <b>{formatBRL(Math.round(m.saldoMedia))}</b>
              </td>
              {m.saldoPlan.map((v, i) => (
                <Money key={i} v={v} tone cur={i === 0} />
              ))}
            </tr>
            <tr>
              <td className="sticky">
                <b>Acumulado</b>
              </td>
              {pastMonths.map((mo) => (
                <td key={mo} className="num muted">
                  —
                </td>
              ))}
              <td className="num muted">—</td>
              {m.acumulado.map((v, i) => (
                <Money key={i} v={v} tone cur={i === 0} />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Money({ v, tone, cur }: { v: number; tone?: boolean; cur?: boolean }) {
  const style = tone ? { color: v >= 0 ? "var(--good)" : "var(--critical)" } : undefined;
  return (
    <td className={cur ? "num cur" : "num"} style={style}>
      {formatBRL(v)}
    </td>
  );
}

function SectionRows({
  kind,
  rows,
  totals,
  planMonths,
  nCols,
  onSave,
}: {
  kind: CategoryKind;
  rows: TrendsRow[];
  totals: TrendsTotals;
  planMonths: string[];
  nCols: number;
  onSave: (categoryId: number, cents: number, month: string) => void;
}) {
  return (
    <>
      <tr>
        <td className="sticky section">{KIND_LABELS[kind]}</td>
        <td colSpan={nCols - 1}></td>
      </tr>
      {rows.map((row) => (
        <tr key={row.id}>
          <td className="sticky">{row.nome}</td>
          {row.past.map((v, i) => (
            <td key={i} className="num">
              {v ? formatBRL(v) : "—"}
            </td>
          ))}
          <td className="num muted">{formatBRL(Math.round(row.media))}</td>
          {row.plan.map((v, i) => (
            <td key={planMonths[i]} className={i === 0 ? "num cur" : "num"}>
              <BudgetInput
                cents={v}
                width={90}
                onSave={(cents) => onSave(row.id, cents, planMonths[i])}
              />
            </td>
          ))}
        </tr>
      ))}
      <tr>
        <td className="sticky">
          <b>Total {KIND_LABELS[kind].toLowerCase()}</b>
        </td>
        {totals.past.map((v, i) => (
          <td key={i} className="num">
            <b>{formatBRL(v)}</b>
          </td>
        ))}
        <td className="num muted">
          <b>{formatBRL(Math.round(totals.media))}</b>
        </td>
        {totals.plan.map((v, i) => (
          <td key={planMonths[i]} className={i === 0 ? "num cur" : "num"}>
            <b>{formatBRL(v)}</b>
            {otimista(kind, totals.media, v) && (
              <span
                className="badge"
                style={{ color: "var(--critical)", marginLeft: 4 }}
                title="destoa da média 6m"
              >
                ⚠
              </span>
            )}
          </td>
        ))}
      </tr>
    </>
  );
}
```

- [ ] **Step 3.2: Rota em `App.tsx`**

Em `frontend/src/App.tsx`, adicionar o import (ordem alfabética dos pages):

```tsx
import Trends from "./pages/Trends";
```

E a rota, depois da linha de `/orcamento`:

```tsx
            <Route path="/tendencias" element={<Trends />} />
```

- [ ] **Step 3.3: Link na sidebar**

Em `frontend/src/components/Layout.tsx`, no array `LINKS`, inserir depois de `/orcamento`:

```tsx
  ["/tendencias", "📈", "Tendências"],
```

- [ ] **Step 3.4: CSS**

Ao final de `frontend/src/styles.css`, adicionar:

```css
.trends-wrap { overflow-x: auto; }
.trends-wrap th, .trends-wrap td { white-space: nowrap; }
.trends-wrap th.sticky, .trends-wrap td.sticky {
  position: sticky; left: 0; background: var(--surface); z-index: 1; text-align: left;
}
.trends-wrap th.cur, .trends-wrap td.cur { background: var(--grid); }
.trends-wrap td.section { padding-top: 14px; font-weight: 700; }
```

(`.card` já usa `background: var(--surface)`, então as células sticky cobrem o conteúdo que rola por baixo em ambos os temas.)

- [ ] **Step 3.5: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run build`
Expected: tudo verde (41 testes), build limpo (warning pré-existente de chunk >500kB é aceitável).

- [ ] **Step 3.6: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/pages/Trends.tsx frontend/src/App.tsx frontend/src/components/Layout.tsx frontend/src/styles.css
git commit -m "feat(ui): trends and projection page"
```

---

### Task 4: Verificação final

- [ ] **Step 4.1: Suítes completas**

Run: `cd frontend && npm test && npx tsc --noEmit && cd ../backend && python -m pytest -q`
Expected: tudo PASS (backend intocado: 103).

- [ ] **Step 4.2: Verificação visual (skill webapp-testing)**

Com backend (porta 8000) e vite (5173) rodando — atenção: se o uvicorn já estiver rodando, ele não precisa reiniciar (não houve mudança de backend); conferir em `http://localhost:5173/#/tendencias`:

1. Tabela com os três grupos, coluna média 6m, mês atual destacado, linhas Saldo e Acumulado (passado com "—").
2. Editar uma célula futura de uma categoria e confirmar: valor propaga para as colunas seguintes sem valor próprio e o Acumulado recalcula.
3. Rolagem horizontal mantém a coluna de rótulos fixa; conferir tema claro e escuro (screenshot dos dois).
4. Sidebar com o item "📈 Tendências" navegando para a página.

- [ ] **Step 4.3: Revisão final única**

Usar a skill superpowers:requesting-code-review para revisão do conjunto de commits da feature (preferência do usuário: sem revisor por task, uma revisão ao final).
