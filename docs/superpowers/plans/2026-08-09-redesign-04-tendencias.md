# Redesign — Plano 04: Tendências — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a tela de Tendências conforme o protótipo `Tendencias.dc.html` do bundle de handoff (local, não versionado) — header com toggle de janela 3/6 meses, strip de 4 KPIs baseado na mediana das saídas, matriz por seção (Entradas → Investimentos → Saídas) com sparklines, chips de desvio "vs. orçado", colunas de orçamento editáveis tingidas, e as linhas Saldo do mês + Acumulado mantidas da tela atual.

**Architecture:** A tela continua frontend puro sobre `useSummaries` (o `month_summary` responde meses futuros com o orçado vigente) + `useCategories` + `usePutBudget` — sem backend novo. O módulo puro `lib/trends.ts` é **reescrito** (a tela existe desde 2026-08-09; isto é redesign): ganha janela parametrizada, `mediana`, `desvioChip`, marcação `semHist` e o cálculo do strip. A tabela `<table>` vira grid de `div`s como nas outras telas redesenhadas, com a primeira coluna sticky preservada. Componentes novos em `components/trends/`.

**Tech Stack:** React 19 + TypeScript, TanStack Query, vitest, CSS puro com os tokens e primitivos dos planos 00–03.

**Spec:** `docs/superpowers/specs/2026-08-09-frontend-redesign-design.md`

**Baseline antes de começar:** frontend 105 testes, backend 110 testes, ambos verdes, em `232344f`.

### Decisões tomadas para este plano (com o usuário, 2026-08-13)

1. **Toggle 3/6 meses, aplicado ao passado E ao futuro.** O handoff proibia o toggle com a premissa "fev–abr sem lançamentos", que é **falsa** (histórico contínuo nov/25–ago/26). Decisão do usuário: um `Segmented` `3 m | 6 m` no header controla a janela inteira — modo N mostra N meses realizados + mês atual + N futuros. **Padrão: 6** (preserva o horizonte que revelou o acumulado de −R$ 44 mil até fev/27).
2. **Mediana no strip, não "excluir a compra do carro".** O protótipo exclui a categoria pelo nome (hardcode). Decisão do usuário: o KPI vira "Saídas típicas — mediana mensal" — a mediana dos totais mensais é robusta a meses atípicos sem regra mágica.
3. **Linhas de saldo mantidas da tela atual: "Saldo do mês" + "Acumulado".** O protótipo mostra "Saldo operacional" (entradas − saídas) e não tem Acumulado. Nosso `summary.saldo` é a variação real de caixa (**inclui** o líquido de investimento) — chamar isso de "operacional" mentiria, e o Acumulado é o motivo de a tela existir. Decisão do usuário: Acumulado fica.
4. **Média por categoria conta mês zerado como zero** (contra a regra literal do README do handoff). A premissa da regra ("nunca dividir por 6 incluindo meses vazios") era dado **não importado** — esse caso agora é o `n/d` (janela inteira zerada, decisão 5). Com importação contínua, zero num mês é zero de verdade: dividir "Presentes" só pelos meses com gasto inflaria a média mensal.
5. **`n/d` = categoria com realizado zero em TODA a janela.** Não existe flag "não importado" no modelo; é a única derivação possível. Linha `n/d` fica fora da média, do chip e dos dois lados de qualquer comparativo; o KPI "Orçado sem histórico" conta as que ainda assim têm orçado no mês atual.
6. **Chips de desvio (±25%) nas linhas e nos totais de entradas e saídas; suprimidos em investimento** (linha e total — comparar meta de aporte com uma média que mistura aportes e resgates não significa nada, como o handoff diz).
7. **Ordenação:** saídas por |desvio| decrescente ("sem orçado" no topo, sem histórico no fim, empate por nome); entradas e investimentos alfabéticos.
8. **Sem "Aplicar média"** — já cancelado na spec (decisão 3 da reconciliação: só o que a API suporta).
9. **Primeira coluna sticky mantida** — no modo 6 a grade passa de 1.400px; a coluna de categoria grudada no scroll horizontal já existe hoje e o redesign preserva.

---

### Task 1: Reescrever o módulo puro `lib/trends.ts` (TDD)

**Files:**
- Modify: `frontend/src/lib/trends.ts` (reescrita)
- Modify: `frontend/src/lib/trends.test.ts` (reescrita)
- Modify: `frontend/src/lib/money.ts` (novo `formatUnitsSigned`)
- Modify: `frontend/src/lib/money.test.ts`

> A página antiga (`pages/Trends.tsx`) continua compilando durante esta task: `trendsWindow`
> ganha o parâmetro `span` **com default 6**, `buildTrends` mantém a assinatura, e `otimista`
> fica no arquivo até a Task 4 (quando a página é reescrita e a função sai).

- [ ] **Step 1.1: Teste do `formatUnitsSigned`**

Ao final de `frontend/src/lib/money.test.ts`, dentro do describe existente do módulo (ou num `describe("formatUnitsSigned", …)` novo ao final do arquivo):

```ts
describe("formatUnitsSigned", () => {
  it("usa o traço de menos do design, sem R$ nem centavos", () => {
    expect(formatUnitsSigned(-2568675)).toBe("−25.687");
    expect(formatUnitsSigned(510000)).toBe("5.100");
    expect(formatUnitsSigned(0)).toBe("0");
  });
});
```

Acrescentar `formatUnitsSigned` ao import de `./money` no topo do arquivo.

- [ ] **Step 1.2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/money.test.ts`
Expected: FAIL — `formatUnitsSigned` não existe.

- [ ] **Step 1.3: Implementar `formatUnitsSigned`**

Ao final de `frontend/src/lib/money.ts`:

```ts
/** `formatUnits` com o traço de menos do design (U+2212). Para a matriz de Tendências. */
export function formatUnitsSigned(cents: number): string {
  const abs = formatUnits(Math.abs(cents));
  return cents < 0 ? MINUS + abs : abs;
}
```

Run: `cd frontend && npx vitest run src/lib/money.test.ts`
Expected: PASS.

- [ ] **Step 1.4: Reescrever os testes de trends**

Substituir todo o conteúdo de `frontend/src/lib/trends.test.ts` por:

```ts
import { describe, expect, it } from "vitest";

import type { Category, CategoryKind, Summary } from "../api/types";
import { buildTrends, desvioChip, mediana, trendsStrip, trendsWindow } from "./trends";

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
    dias: { decorridos: 0, no_mes: 30 },
    categorias: opts.categorias ?? [],
  };
}

const CATS = [
  cat(2, "Salário", "entrada"),
  cat(1, "Mercado", "saida"),
  cat(3, "Investimentos", "investimento"),
];

describe("trendsWindow", () => {
  it("janela 6: 6 passados e atual+6, atravessando a virada de ano", () => {
    const w = trendsWindow("2026-01", 6);
    expect(w.pastMonths).toEqual([
      "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12",
    ]);
    expect(w.planMonths).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
    ]);
  });

  it("janela 3: 3 passados e atual+3", () => {
    const w = trendsWindow("2026-08", 3);
    expect(w.pastMonths).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(w.planMonths).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
  });
});

describe("mediana", () => {
  it("ímpar pega o valor central; o outlier não puxa", () => {
    expect(mediana([500000, 400000, 10000000])).toBe(500000);
  });

  it("par tira a média dos dois centrais", () => {
    expect(mediana([100, 200, 300, 10000])).toBe(250);
  });

  it("vazia é zero", () => {
    expect(mediana([])).toBe(0);
  });
});

describe("desvioChip", () => {
  it("orçado bem acima da média: chip +% em warn", () => {
    expect(desvioChip("saida", 100000, 132000)).toEqual({ label: "+32%", tone: "warn" });
  });

  it("orçado bem abaixo: chip −% em accent", () => {
    expect(desvioChip("saida", 100000, 60000)).toEqual({ label: "−40%", tone: "accent" });
  });

  it("desvio menor que 25% não gera chip", () => {
    expect(desvioChip("saida", 100000, 120000)).toBeNull();
    expect(desvioChip("entrada", 100000, 80000)).toBeNull();
  });

  it("média positiva sem orçado vira o chip 'sem orçado'", () => {
    expect(desvioChip("saida", 100000, 0)).toEqual({ label: "sem orçado", tone: "over" });
  });

  it("sem média positiva, ou em investimento, não há chip", () => {
    expect(desvioChip("saida", 0, 50000)).toBeNull();
    expect(desvioChip("investimento", 100000, 500000)).toBeNull();
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
    expect(m.rows.saida[0].semHist).toBe(false);
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

  it("categoria zerada na janela inteira vira semHist, sem média nem chip", () => {
    const s1 = mkSummary("2026-01");
    const s2 = mkSummary("2026-02");
    const p1 = mkSummary("2026-03", { categorias: [line(1, "saida", 0, 500000)] });
    const m = buildTrends(2, [s1, s2, p1], CATS);
    expect(m.rows.saida[0].semHist).toBe(true);
    expect(m.rows.saida[0].media).toBe(0);
    expect(m.rows.saida[0].chip).toBeNull();
  });

  it("linha com histórico ganha chip contra o orçado do mês atual", () => {
    const s1 = mkSummary("2026-01", { categorias: [line(1, "saida", 100000)] });
    const p1 = mkSummary("2026-02", { categorias: [line(1, "saida", 0, 200000)] });
    const m = buildTrends(1, [s1, p1], CATS);
    expect(m.rows.saida[0].chip).toEqual({ label: "+100%", tone: "warn" });
  });

  it("saídas ordenam por desvio: sem orçado no topo, sem histórico no fim", () => {
    const cats = [
      cat(1, "Grande desvio", "saida"),
      cat(2, "Sem orçado", "saida"),
      cat(3, "Na média", "saida"),
      cat(4, "Sem histórico", "saida"),
    ];
    const s1 = mkSummary("2026-01", {
      categorias: [line(1, "saida", 100000), line(2, "saida", 50000), line(3, "saida", 80000)],
    });
    const p1 = mkSummary("2026-02", {
      categorias: [line(1, "saida", 0, 200000), line(3, "saida", 0, 80000), line(4, "saida", 0, 10000)],
    });
    const m = buildTrends(1, [s1, p1], cats);
    expect(m.rows.saida.map((r) => r.nome)).toEqual([
      "Sem orçado", "Grande desvio", "Na média", "Sem histórico",
    ]);
  });

  it("entradas ficam em ordem alfabética", () => {
    const cats = [cat(2, "Salário", "entrada"), cat(5, "Outras", "entrada")];
    const m = buildTrends(1, [mkSummary("2026-01"), mkSummary("2026-02")], cats);
    expect(m.rows.entrada.map((r) => r.nome)).toEqual(["Outras", "Salário"]);
  });

  it("totais vêm dos blocos do summary (incluem não categorizadas)", () => {
    const s1 = mkSummary("2026-01", { entradas: [850000, 0] }); // sem linha por categoria
    const p1 = mkSummary("2026-02", { entradas: [0, 900000] });
    const m = buildTrends(1, [s1, p1], CATS);
    expect(m.totals.entrada.past).toEqual([850000]);
    expect(m.totals.entrada.media).toBe(850000);
    expect(m.totals.entrada.plan).toEqual([900000]);
  });

  it("total ganha chip do desvio, menos em investimento", () => {
    const s1 = mkSummary("2026-01", { saidas: [100000, 0], investimentos: [100000, 0] });
    const p1 = mkSummary("2026-02", { saidas: [0, 150000], investimentos: [0, 500000] });
    const m = buildTrends(1, [s1, p1], CATS);
    expect(m.totals.saida.chip).toEqual({ label: "+50%", tone: "warn" });
    expect(m.totals.investimento.chip).toBeNull();
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

describe("trendsStrip", () => {
  // 3 meses de saídas: 4.000, 5.000 e um atípico de 100.000; orçado atual 6.000.
  // "Viagem" nunca teve lançamento mas está orçada — é o caso "sem histórico".
  const mk = () => {
    const cats = [cat(1, "Mercado", "saida"), cat(4, "Viagem", "saida")];
    const s1 = mkSummary("2026-01", { saidas: [400000, 0], categorias: [line(1, "saida", 400000)] });
    const s2 = mkSummary("2026-02", { saidas: [500000, 0], categorias: [line(1, "saida", 500000)] });
    const s3 = mkSummary("2026-03", { saidas: [10000000, 0], categorias: [line(1, "saida", 10000000)] });
    const p1 = mkSummary("2026-04", {
      saidas: [0, 600000],
      categorias: [line(1, "saida", 0, 400000), line(4, "saida", 0, 200000)],
    });
    return trendsStrip(buildTrends(3, [s1, s2, s3, p1], cats));
  };

  it("a mediana dos totais mensais resiste ao mês atípico", () => {
    expect(mk().medianaSaidas).toBe(500000);
  });

  it("delta do orçado atual contra a mediana", () => {
    expect(mk().orcadoAtual).toBe(600000);
    expect(mk().deltaPct).toBe(20);
  });

  it("conta categorias fora da média e o orçado sem histórico", () => {
    const s = mk();
    expect(s.foraDaMedia).toBe(1); // Mercado: orçado 4.000 vs média ~36.333 → −89%
    expect(s.semHist).toBe(1); // Viagem
    expect(s.semHistOrcado).toBe(200000);
  });
});
```

> Os testes de `otimista` saem — a função é substituída pelos chips de desvio, mas
> **permanece exportada** até a Task 4 para a página antiga continuar compilando.

- [ ] **Step 1.5: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/trends.test.ts`
Expected: FAIL — `mediana`, `desvioChip`, `trendsStrip` não existem; `semHist`/`chip` ausentes.

- [ ] **Step 1.6: Reescrever `lib/trends.ts`**

Substituir todo o conteúdo de `frontend/src/lib/trends.ts` por:

```ts
import type { Category, CategoryKind, Summary } from "../api/types";
import { addMonths, lastNMonths } from "./months";
import { pctRaw } from "./pct";

// Matriz da página Tendências: passado = realizado, plano = orçado vigente.
// Valores de investimento são o líquido com sinal (positivo = aportou mais que resgatou).

/** Desvio do orçado do mês atual contra a média realizada, quando passa de ±25%. */
export interface TrendsChip {
  label: string;
  tone: "warn" | "accent" | "over";
}

export interface TrendsRow {
  id: number;
  nome: string;
  kind: CategoryKind;
  past: number[];
  media: number;
  plan: number[];
  /** Nenhum realizado na janela inteira: células viram n/d, fora da média e do chip. */
  semHist: boolean;
  chip: TrendsChip | null;
}

export interface TrendsTotals {
  past: number[];
  media: number;
  plan: number[];
  chip: TrendsChip | null;
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

// Mês zerado conta como zero: com importação contínua, zero é zero de verdade.
// O caso "dado não existe" é o semHist (janela inteira zerada), que vira n/d.
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Mediana simples — a base do strip de KPIs, robusta a meses atípicos. */
export function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Janela da matriz: `span` meses fechados + mês atual + `span` futuros. */
export function trendsWindow(
  today: string,
  span = 6
): { pastMonths: string[]; planMonths: string[] } {
  return {
    pastMonths: lastNMonths(addMonths(today, -1), span),
    planMonths: Array.from({ length: span + 1 }, (_, i) => addMonths(today, i)),
  };
}

const LIMIAR_DESVIO = 25;

/**
 * Chip "vs. orçado". Suprimido em investimento — comparar meta de aporte com uma média
 * que mistura aportes e resgates não significa nada. "sem orçado" avisa que a categoria
 * tem histórico mas nenhum orçamento no mês atual.
 */
export function desvioChip(
  kind: CategoryKind,
  media6m: number,
  orcadoAtual: number
): TrendsChip | null {
  if (kind === "investimento" || media6m <= 0) return null;
  if (orcadoAtual === 0) return { label: "sem orçado", tone: "over" };
  const d = Math.round(pctRaw(orcadoAtual - media6m, media6m));
  if (Math.abs(d) < LIMIAR_DESVIO) return null;
  return d > 0 ? { label: `+${d}%`, tone: "warn" } : { label: `−${-d}%`, tone: "accent" };
}

const porNome = (a: { nome: string }, b: { nome: string }) =>
  a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });

/** Saídas: o que mais desvia do histórico primeiro; sem histórico por último. */
const desvioKey = (r: TrendsRow & { desvio: number | null }) => {
  if (r.semHist) return -2;
  if (r.chip?.label === "sem orçado") return Number.MAX_SAFE_INTEGER;
  return r.desvio === null ? -1 : Math.abs(r.desvio);
};

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
    const linhas = categories
      .filter((c) => !c.archived && c.kind === kind)
      .map((c) => {
        const pastVals = past.map((s) => line(s, c.id)?.real ?? 0);
        const planVals = plan.map((s) => line(s, c.id)?.orcado ?? 0);
        const semHist = pastVals.every((v) => v === 0);
        const m = semHist ? 0 : media(pastVals);
        const desvio = m > 0 ? Math.round(pctRaw((planVals[0] ?? 0) - m, m)) : null;
        return {
          id: c.id,
          nome: c.name,
          kind,
          past: pastVals,
          media: m,
          plan: planVals,
          semHist,
          chip: semHist ? null : desvioChip(kind, m, planVals[0] ?? 0),
          desvio,
        };
      });
    linhas.sort(
      kind === "saida" ? (a, b) => desvioKey(b) - desvioKey(a) || porNome(a, b) : porNome
    );
    // `desvio` é só chave de ordenação; o tipo exportado TrendsRow não o expõe.
    rows[kind] = linhas;

    const pastTotals = past.map((s) => s[BLOCK[kind]].real);
    const planTotals = plan.map((s) => s[BLOCK[kind]].orcado);
    const mediaTotal = media(pastTotals);
    totals[kind] = {
      past: pastTotals,
      media: mediaTotal,
      plan: planTotals,
      chip: desvioChip(kind, mediaTotal, planTotals[0] ?? 0),
    };
  }

  const saldoPast = past.map((s) => s.saldo.real);
  const saldoPlan = plan.map((s) => s.saldo.orcado);
  const acumulado: number[] = [];
  let acc = 0;
  for (const v of saldoPlan) {
    acc += v;
    acumulado.push(acc);
  }

  return { rows, totals, saldoPast, saldoMedia: media(saldoPast), saldoPlan, acumulado };
}

export interface TrendsStrip {
  medianaSaidas: number;
  orcadoAtual: number;
  /** Desvio % do orçado atual sobre a mediana; null sem base. */
  deltaPct: number | null;
  foraDaMedia: number;
  semHist: number;
  semHistOrcado: number;
}

/** KPIs do topo. A mediana ignora meses atípicos — a compra do carro não vira "base". */
export function trendsStrip(m: TrendsMatrix): TrendsStrip {
  const medianaSaidas = mediana(m.totals.saida.past);
  const orcadoAtual = m.totals.saida.plan[0] ?? 0;
  const semHistRows = KINDS.flatMap((k) => m.rows[k]).filter(
    (r) => r.semHist && (r.plan[0] ?? 0) > 0
  );
  return {
    medianaSaidas,
    orcadoAtual,
    deltaPct:
      medianaSaidas > 0
        ? Math.round(pctRaw(orcadoAtual - medianaSaidas, medianaSaidas))
        : null,
    foraDaMedia: m.rows.saida.filter((r) => r.chip !== null).length,
    semHist: semHistRows.length,
    semHistOrcado: semHistRows.reduce((sum, r) => sum + (r.plan[0] ?? 0), 0),
  };
}

// Usada só pela página antiga; sai na Task 4 junto com a reescrita de Trends.tsx.
export function otimista(kind: CategoryKind, media6m: number, plano: number): boolean {
  if (media6m <= 0) return false;
  const ratio = plano / media6m;
  return kind === "saida" ? ratio < 0.9 : ratio > 1.1;
}
```

- [ ] **Step 1.7: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/lib/trends.test.ts && npx tsc --noEmit && npm test`
Expected: trends.test.ts com 24 testes PASS; tsc limpo (a página antiga ainda compila); suíte completa **120 testes** (105 − 10 antigos + 24 novos + 1 de money).

- [ ] **Step 1.8: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/lib/trends.ts frontend/src/lib/trends.test.ts frontend/src/lib/money.ts frontend/src/lib/money.test.ts
git commit -m "feat(ui): trends computation module with 3/6 window, median strip and deviation chips"
```

---

### Task 2: `BudgetInput` com largura fluida e strip de KPIs

**Files:**
- Modify: `frontend/src/components/BudgetInput.tsx`
- Create: `frontend/src/components/trends/TrendsKpis.tsx`
- Modify: `frontend/src/styles/pages.css`

- [ ] **Step 2.1: `BudgetInput` aceita largura em string**

As células da matriz precisam de `width: 100%`. Em `frontend/src/components/BudgetInput.tsx`, trocar a linha do tipo da prop:

```tsx
  width?: number;
```

por:

```tsx
  width?: number | string;
```

Nada mais muda — `style={{ width }}` aceita os dois.

- [ ] **Step 2.2: `TrendsKpis`**

Create `frontend/src/components/trends/TrendsKpis.tsx`:

```tsx
import { formatBRL } from "../../lib/money";
import { monthLabel } from "../../lib/months";
import type { TrendsStrip } from "../../lib/trends";
import Money from "../Money";

export default function TrendsKpis({
  strip,
  span,
  month,
}: {
  strip: TrendsStrip;
  span: number;
  month: string;
}) {
  const d = strip.deltaPct;
  const deltaTone = d !== null && d > 20 ? "tone-warn" : d !== null && d < -20 ? "tone-accent" : undefined;
  const deltaLabel =
    d === null
      ? "sem base de comparação"
      : d === 0
        ? "igual à mediana"
        : `${d > 0 ? "+" : "−"}${Math.abs(d)}% vs. a mediana`;

  return (
    <section className="kpi-strip trends-kpis">
      <div className="kpi">
        <div className="label">Saídas típicas — mediana mensal</div>
        <div className="kpi-value">
          <Money cents={strip.medianaSaidas} />
        </div>
        <div className="kpi-note">últimos {span} meses — a mediana ignora meses atípicos</div>
      </div>

      <div className="kpi">
        <div className="label">Saídas orçadas em {monthLabel(month)}</div>
        <div className="kpi-value">
          <Money cents={strip.orcadoAtual} />
        </div>
        <div className="kpi-note">{deltaTone ? <span className={deltaTone}>{deltaLabel}</span> : deltaLabel}</div>
      </div>

      <div className="kpi">
        <div className="label">Categorias fora da média</div>
        <div className="kpi-value mono">{strip.foraDaMedia}</div>
        <div className="kpi-note">desvio acima de 25% entre orçado e média</div>
      </div>

      <div className="kpi">
        <div className="label">Orçado sem histórico</div>
        <div className="kpi-value mono">{strip.semHist} categorias</div>
        <div className="kpi-note">
          {strip.semHist > 0 ? (
            <span className="tone-warn">{formatBRL(strip.semHistOrcado)} orçados sem base</span>
          ) : (
            "todas as categorias orçadas têm histórico"
          )}
        </div>
      </div>
    </section>
  );
}
```

> Os tons das notas ficam num `<span>` interno: `.kpi-note` define a cor no próprio
> elemento e ganharia de `.tone-*` na especificidade/ordem.

- [ ] **Step 2.3: CSS**

Ao final de `frontend/src/styles/pages.css`:

```css
/* ---------- Tendências ---------- */
.trends-range {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
}

.trends-kpis {
  grid-template-columns: repeat(4, 1fr);
}

.trends-kpis .kpi-value .money,
.trends-kpis .kpi-value.mono {
  font-size: 21px;
}
```

- [ ] **Step 2.4: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: limpo. (Componente ainda não usado — entra na Task 4.)

- [ ] **Step 2.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/BudgetInput.tsx frontend/src/components/trends frontend/src/styles/pages.css
git commit -m "feat(ui): trends kpi strip"
```

---

### Task 3: Matriz — grid com sparklines, chips e colunas editáveis

**Files:**
- Create: `frontend/src/components/trends/MatrixCard.tsx`
- Modify: `frontend/src/styles/pages.css`

- [ ] **Step 3.1: Criar o componente**

Create `frontend/src/components/trends/MatrixCard.tsx`:

```tsx
import type { CategoryKind } from "../../api/types";
import { formatUnitsSigned } from "../../lib/money";
import { monthLabel } from "../../lib/months";
import type { TrendsMatrix, TrendsRow, TrendsTotals } from "../../lib/trends";
import BudgetInput from "../BudgetInput";
import Pill from "../Pill";

const SECTIONS: { kind: CategoryKind; label: string; nota?: string }[] = [
  { kind: "entrada", label: "Entradas" },
  {
    kind: "investimento",
    label: "Investimentos",
    nota: "aporte líquido; negativo é resgate, não entra em saídas",
  },
  { kind: "saida", label: "Saídas", nota: "ordenadas por desvio entre orçado e média" },
];

/** Classe das células do bloco de plano: o mês corrente tinge mais forte que os futuros. */
const planCls = (base: string, i: number) =>
  `${base} ${i === 0 ? "trends-col-cur" : "trends-col-fut"}`;

export default function MatrixCard({
  m,
  pastMonths,
  planMonths,
  onSave,
}: {
  m: TrendsMatrix;
  pastMonths: string[];
  planMonths: string[];
  onSave: (categoryId: number, cents: number, month: string) => void;
}) {
  return (
    <section className="card trends-card">
      <div className={`trends-grid trends-grid--${pastMonths.length}`}>
        <div className="trends-row trends-head">
          <div className="trends-cell-cat">Categoria</div>
          <div />
          {pastMonths.map((mo) => (
            <div key={mo} className="num">
              {monthLabel(mo)}
            </div>
          ))}
          <div className="num">média</div>
          <div className="trends-chip-cell">vs. orçado</div>
          {planMonths.map((mo, i) => (
            <div key={mo} className={planCls("num", i)}>
              {monthLabel(mo)}
            </div>
          ))}
        </div>

        {SECTIONS.map(({ kind, label, nota }) => (
          <Section
            key={kind}
            kind={kind}
            label={label}
            nota={nota}
            rows={m.rows[kind]}
            totals={m.totals[kind]}
            planMonths={planMonths}
            onSave={onSave}
          />
        ))}

        <div className="trends-row trends-total">
          <div className="trends-cell-cat">Saldo do mês</div>
          <div />
          {m.saldoPast.map((v, i) => (
            <ToneCell key={i} v={v} />
          ))}
          <ToneCell v={m.saldoMedia} media />
          <div />
          {m.saldoPlan.map((v, i) => (
            <ToneCell key={i} v={v} plan={i} />
          ))}
        </div>

        <div className="trends-row trends-total">
          <div className="trends-cell-cat">Acumulado</div>
          <div />
          {pastMonths.map((mo) => (
            <div key={mo} className="num">
              <span className="trends-zero">—</span>
            </div>
          ))}
          <div className="num">
            <span className="trends-zero">—</span>
          </div>
          <div />
          {m.acumulado.map((v, i) => (
            <ToneCell key={i} v={v} plan={i} />
          ))}
        </div>
      </div>

      <div className="trends-legend">
        <span>média = média da janela; mês sem movimento conta como zero</span>
        <span>
          <span className="nd">n/d</span> = sem nenhum lançamento na janela; fora da média e
          do comparativo
        </span>
        <span>
          <span className="trends-legend-swatch" />
          colunas tingidas = orçamento editável; o valor salvo vale a partir daquele mês
        </span>
      </div>
    </section>
  );
}

function Section({
  kind,
  label,
  nota,
  rows,
  totals,
  planMonths,
  onSave,
}: {
  kind: CategoryKind;
  label: string;
  nota?: string;
  rows: TrendsRow[];
  totals: TrendsTotals;
  planMonths: string[];
  onSave: (categoryId: number, cents: number, month: string) => void;
}) {
  return (
    <>
      <div className="trends-section-head">
        <span className={`trends-dot trends-dot--${kind}`} />
        <span className="trends-section-label">{label}</span>
        {nota && <span className="trends-section-nota">— {nota}</span>}
      </div>
      {rows.map((r) => (
        <Row key={r.id} r={r} planMonths={planMonths} onSave={onSave} />
      ))}
      <div className="trends-row trends-total">
        <div className="trends-cell-cat">Total {label.toLowerCase()}</div>
        <div />
        {totals.past.map((v, i) => (
          <Cell key={i} v={v} />
        ))}
        <div className="num trends-media">{formatUnitsSigned(totals.media)}</div>
        <div className="trends-chip-cell">
          {totals.chip && <Pill tone={totals.chip.tone}>{totals.chip.label}</Pill>}
        </div>
        {totals.plan.map((v, i) => (
          <div key={planMonths[i]} className={planCls("num", i)}>
            {formatUnitsSigned(v)}
          </div>
        ))}
      </div>
    </>
  );
}

const BAR_MAX = 16;

function Row({
  r,
  planMonths,
  onSave,
}: {
  r: TrendsRow;
  planMonths: string[];
  onSave: (categoryId: number, cents: number, month: string) => void;
}) {
  const max = Math.max(...r.past.map(Math.abs), 1);
  return (
    <div className="trends-row">
      <div className="trends-cell-cat" title={r.nome}>
        {r.nome}
      </div>
      <span className={`trends-spark trends-spark--${r.kind}`} aria-hidden="true">
        {r.past.map((v, i) => (
          <i
            key={i}
            className={v ? undefined : "is-zero"}
            style={{ height: `${Math.max(2, Math.round((Math.abs(v) / max) * BAR_MAX))}px` }}
          />
        ))}
      </span>
      {r.past.map((v, i) => (
        <Cell key={i} v={v} nd={r.semHist} />
      ))}
      <div className="num trends-media">
        {r.semHist ? <span className="nd">n/d</span> : formatUnitsSigned(r.media)}
      </div>
      <div className="trends-chip-cell">
        {r.chip && <Pill tone={r.chip.tone}>{r.chip.label}</Pill>}
      </div>
      {r.plan.map((v, i) => (
        <div key={planMonths[i]} className={planCls("trends-input", i)}>
          <BudgetInput
            cents={v}
            width="100%"
            className={r.kind === "investimento" ? "mono invest" : "mono"}
            ariaLabel={`Orçamento de ${r.nome} em ${monthLabel(planMonths[i])}`}
            onSave={(cents) => onSave(r.id, cents, planMonths[i])}
          />
        </div>
      ))}
    </div>
  );
}

function Cell({ v, nd = false }: { v: number; nd?: boolean }) {
  if (nd)
    return (
      <div className="num">
        <span className="nd">n/d</span>
      </div>
    );
  if (v === 0)
    return (
      <div className="num">
        <span className="trends-zero">—</span>
      </div>
    );
  return (
    <div className="num">
      {v < 0 ? <span className="tone-over">{formatUnitsSigned(v)}</span> : formatUnitsSigned(v)}
    </div>
  );
}

/** Saldo/acumulado: teal/vermelho pelo sinal; `plan` marca a coluna tingida. */
function ToneCell({ v, plan, media = false }: { v: number; plan?: number; media?: boolean }) {
  const base = media ? "num trends-media" : "num";
  const cls = plan === undefined ? base : planCls(base, plan);
  return (
    <div className={cls}>
      <span className={v < 0 ? "tone-over" : "tone-accent"}>{formatUnitsSigned(v)}</span>
    </div>
  );
}
```

- [ ] **Step 3.2: CSS**

Ao final da seção "Tendências" de `frontend/src/styles/pages.css`:

```css
.trends-card {
  padding: 6px 0 12px;
  overflow-x: auto;
}

/* Cada linha é um grid; o template é compartilhado por janela via custom property. */
.trends-grid--3 {
  --trend-cols: minmax(150px, 1.4fr) 40px repeat(3, minmax(76px, 0.95fr))
    minmax(74px, 0.9fr) 88px repeat(4, minmax(84px, 1fr));
  min-width: 960px;
}

.trends-grid--6 {
  --trend-cols: minmax(150px, 1.4fr) 52px repeat(6, minmax(70px, 0.9fr))
    minmax(74px, 0.9fr) 88px repeat(7, minmax(78px, 0.95fr));
  min-width: 1420px;
}

.trends-row {
  display: grid;
  grid-template-columns: var(--trend-cols);
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--divider);
}

.trends-row > :last-child {
  padding-right: 18px;
}

.trends-grid .num {
  font-size: 12px;
  color: var(--ink-2);
}

.trends-grid .trends-media {
  color: var(--ink);
}

.trends-card .nd {
  font-style: italic;
  color: var(--muted-2);
}

.trends-zero {
  color: var(--muted);
}

/* Primeira coluna gruda no scroll horizontal; o box-shadow cobre o gap do grid. */
.trends-cell-cat {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--surface);
  box-shadow: 8px 0 var(--surface);
  padding-left: 18px;
  font-size: 12.5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trends-head {
  padding: 10px 0 8px;
  border-bottom: 1px solid var(--border);
}

.trends-head > div {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.trends-head .trends-col-cur {
  color: var(--ink);
}

.trends-chip-cell {
  text-align: center;
}

.trends-chip-cell .pill {
  font-size: 10px;
}

.trends-col-cur,
.trends-col-fut {
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 8px;
  background: var(--tint-accent);
}

.trends-col-fut {
  background: color-mix(in srgb, var(--tint-accent) 55%, transparent);
}

/* Futuro fica apagado até receber foco — o mês corrente é o protagonista. */
.trends-col-fut input {
  color: var(--muted);
  border-color: var(--border);
}

.trends-col-fut input:focus {
  color: var(--ink);
}

.trends-spark {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 16px;
}

.trends-spark i {
  width: 5px;
  border-radius: 1px;
}

.trends-spark--entrada i {
  background: var(--accent);
}

.trends-spark--investimento i {
  background: var(--invest);
}

.trends-spark--saida i {
  background: var(--ink-2);
  opacity: 0.55;
}

.trends-spark i.is-zero {
  background: var(--track);
  opacity: 1;
}

.trends-section-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 15px 18px 6px;
}

.trends-dot {
  width: 6px;
  height: 6px;
  border-radius: 2px;
}

.trends-dot--entrada {
  background: var(--accent);
}

.trends-dot--investimento {
  background: var(--invest);
}

.trends-dot--saida {
  background: var(--muted);
}

.trends-section-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-2);
}

.trends-section-nota {
  font-size: 11px;
  color: var(--muted);
}

.trends-total {
  padding: 8px 0;
  border-top: 1px solid var(--border-strong);
  border-bottom: 1px solid var(--border);
}

.trends-total .trends-cell-cat {
  font-size: 12.5px;
  font-weight: 600;
}

.trends-total .num {
  font-size: 12.5px;
  font-weight: 500;
}

.trends-total .trends-media {
  font-weight: 600;
}

.trends-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 14px 18px 2px;
  margin-top: 6px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
}

.trends-legend-swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  margin-right: 6px;
  background: var(--accent);
  opacity: 0.3;
}
```

- [ ] **Step 3.3: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: tudo verde (120 testes; componente ainda não usado).

- [ ] **Step 3.4: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/trends frontend/src/styles/pages.css
git commit -m "feat(ui): trends matrix with sparklines, deviation chips and editable plan columns"
```

---

### Task 4: Reescrita da página e verificação final

**Files:**
- Modify: `frontend/src/pages/Trends.tsx` (reescrita)
- Modify: `frontend/src/lib/trends.ts` (remover `otimista`)
- Modify: `frontend/src/styles/pages.css` (remover CSS antigo)

- [ ] **Step 4.1: Reescrever a página**

Substituir todo o conteúdo de `frontend/src/pages/Trends.tsx` por:

```tsx
import { useState } from "react";

import { useCategories, usePutBudget, useSummaries } from "../api/hooks";
import type { Summary } from "../api/types";
import PageHeader from "../components/PageHeader";
import Segmented from "../components/Segmented";
import MatrixCard from "../components/trends/MatrixCard";
import TrendsKpis from "../components/trends/TrendsKpis";
import { currentMonth, monthLabel, monthName } from "../lib/months";
import { buildTrends, trendsStrip, trendsWindow } from "../lib/trends";

const SPANS = [
  { value: "3" as const, label: "3 m" },
  { value: "6" as const, label: "6 m" },
];

export default function Trends() {
  const [span, setSpan] = useState<"3" | "6">("6");
  const today = currentMonth();
  const { pastMonths, planMonths } = trendsWindow(today, Number(span));
  const results = useSummaries([...pastMonths, ...planMonths]);
  const { data: categories } = useCategories();
  const putBudget = usePutBudget();
  const summaries = results.map((r) => r.data);
  const error = results.find((r) => r.error)?.error;

  const header = (
    <PageHeader
      eyebrow="Tendências"
      title="Realizado e projeção"
      subtitle={`Meses fechados mostram o realizado. De ${monthName(today)} em diante é o orçamento vigente, editável — o valor salvo vale a partir daquele mês.`}
    >
      <span className="trends-range">
        {monthLabel(pastMonths[0])}–{monthLabel(pastMonths[pastMonths.length - 1])} realizado ·{" "}
        {monthLabel(planMonths[0])}–{monthLabel(planMonths[planMonths.length - 1])} orçado
      </span>
      <Segmented value={span} options={SPANS} onChange={setSpan} ariaLabel="Janela de meses" />
    </PageHeader>
  );

  if (error)
    return (
      <>
        {header}
        <p className="error">Erro ao carregar resumo: {(error as Error).message}</p>
      </>
    );
  if (!categories || summaries.some((s) => s === undefined))
    return (
      <>
        {header}
        <p className="muted">Carregando…</p>
      </>
    );

  const m = buildTrends(pastMonths.length, summaries as Summary[], categories);
  const strip = trendsStrip(m);
  const save = (categoryId: number, cents: number, month: string) =>
    putBudget.mutate({ category_id: categoryId, amount_cents: cents, valid_from: month });

  return (
    <>
      {header}
      <TrendsKpis strip={strip} span={pastMonths.length} month={today} />
      <MatrixCard m={m} pastMonths={pastMonths} planMonths={planMonths} onSave={save} />
    </>
  );
}
```

> Trocar a janela de 6 para 3 reaproveita o cache do React Query (as queries por mês já
> estão resolvidas); voltar para 6 idem. `useQueries` aceita a lista mudar de tamanho.

- [ ] **Step 4.2: Remover `otimista` de `lib/trends.ts`**

Apagar a função `otimista` e o comentário acima dela (o bloco final do arquivo, marcado
"Usada só pela página antiga"). Ninguém mais a importa.

- [ ] **Step 4.3: Remover o CSS antigo da tela**

Em `frontend/src/styles/pages.css`, apagar o bloco `.trends-wrap` inteiro (as regras
`.trends-wrap`, `.trends-wrap th/td`, `.trends-wrap th.sticky/td.sticky`,
`.trends-wrap th.cur/td.cur`, `.trends-wrap td.section` — hoje nas linhas ~73–98).
**Não** apagar `.num`, `.pos` nem `.badge`: são genéricos e as telas ainda não
redesenhadas (Importar, Configurações) podem usá-los; conferir com
`grep -rn "\"badge\|\.pos\b" frontend/src` antes de qualquer limpeza extra — se não
houver uso fora do CSS, deixar a remoção para os planos 05/06.

- [ ] **Step 4.4: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint && npm run build`
Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: frontend 120 testes PASS, build ok; backend `110 passed` (intocado).

> `npm run build` não é opcional: o app é acessado em `localhost:8000`, onde o FastAPI
> serve `frontend/dist`.

- [ ] **Step 4.5: Verificação visual (skill webapp-testing)**

Em `http://localhost:5173/#/tendencias` (vite dev; **nunca** subir servidor de teste na
porta 8000 — é a porta do app real):

1. **Header:** eyebrow "Tendências", h1 "Realizado e projeção", subtítulo de vigência;
   à direita o rótulo mono "fev/26–jul/26 realizado · ago/26–fev/27 orçado" e o
   segmented "3 m / 6 m" com 6 m ativo.
2. **Toggle:** clicar em "3 m" encurta a grade para 3 passados + atual+3 e o rótulo do
   header acompanha ("mai/26–jul/26 realizado · ago/26–nov/26 orçado"); voltar a 6 m é
   instantâneo (cache).
3. **KPIs:** mediana das saídas plausível (histórico real ~R$ 40–55 mil/mês; a compra do
   carro de jun–jul **não** deve inflar a mediana); delta vs. mediana com tom coerente;
   contagem de categorias fora da média bate com os chips visíveis na matriz; "Orçado
   sem histórico" conta as categorias orçadas com janela toda zerada.
4. **Matriz:** três seções na ordem Entradas → Investimentos → Saídas, com pontinho de
   cor e notas; sparklines com barras proporcionais; valores passados em mono sem R$;
   zero vira "—"; resgates/negativos em vermelho; média em destaque.
5. **Chips:** só em desvios ≥ 25%; "+X%" âmbar, "−X%" teal, "sem orçado" vermelho;
   nenhum chip na seção e no total de Investimentos; saídas ordenadas por desvio.
6. **Colunas de plano:** mês corrente tingido mais forte; futuros mais fracos com texto
   apagado até o foco; inputs de investimento com borda lilás.
7. **Edição propaga vigência:** editar set/26 numa categoria e confirmar que out/26+
   acompanham após o refetch (PUT com `valid_from` do mês da coluna); Saldo do mês e
   Acumulado recalculam.
8. **Saldo/Acumulado:** Saldo do mês com teal/vermelho por sinal; Acumulado só nas
   colunas de plano, com "—" no passado; conferir contra o dado conhecido (~−R$ 44 mil
   até fev/27 se o orçamento não mudou).
9. **Sticky:** estreitar a janela e rolar horizontalmente — a coluna de categoria fica
   fixa, sem texto vazando por trás.
10. Screenshot em dark e em light; console sem erros.

- [ ] **Step 4.6: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/pages/Trends.tsx frontend/src/lib/trends.ts frontend/src/styles/pages.css
git commit -m "feat(ui): redesigned trends page"
```

- [ ] **Step 4.7: Revisão de código**

Usar a skill code-review sobre o conjunto de commits deste plano (preferência do usuário:
sem revisor por task, uma revisão ao final). Aplicar o que for real, commitar como
`fix(ui): address review findings in the trends redesign`.
