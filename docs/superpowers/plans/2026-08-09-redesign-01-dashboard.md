# Redesign — Plano 01: Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar o Dashboard conforme `design_handoff_frontend_redesign/Dashboard.dc.html` — strip de KPIs, faixa do LLM, card "Onde o dinheiro está queimando" com marca de ritmo e bloco de Investimentos, donut de composição, barras de 6 meses, card "Orçado, ainda não realizado" e bridge em waterfall — e remover o `recharts` do projeto.

**Architecture:** Toda a lógica de cálculo vai para um módulo puro `lib/dashboard.ts` testado com vitest; os componentes só formatam e posicionam. Os gráficos passam a ser CSS puro (`conic-gradient` no donut, `div`s posicionadas no waterfall e nas barras), o que elimina o `recharts` e o helper `useThemeColors` que existia só para alimentá-lo. Cada task substitui um pedaço do dashboard e religa o `Dashboard.tsx` na hora, então o app fica utilizável em todos os commits.

**Tech Stack:** React 19 + TypeScript, TanStack Query, vitest, CSS puro com os tokens e primitivos do plano 00.

**Spec:** `docs/superpowers/specs/2026-08-09-frontend-redesign-design.md`
**Plano anterior:** `docs/superpowers/plans/2026-08-09-redesign-00-fundacao.md` (fundação — tokens, shell, primitivos)

**Baseline antes de começar:** frontend 48 testes, backend 110 testes, ambos verdes, em `dbb48fb`.

### Decisões tomadas para este plano

1. **Aportes/resgates brutos** não existem no `summary` — o dashboard busca `GET /transactions?month=` e agrega no frontend. Sem backend novo.
2. **A faixa do LLM segue o design** (3 mini-cards + link "revisar N →") **e mantém o botão "Confirmar todas"**, que existe hoje e o desenho não prevê.
3. **O donut usa a rampa fixa do design** (teal → cinza, por tamanho de fatia), não `category.color`. A rampa vira tokens `--donut-1..7` para funcionar nos dois temas.

### O que o design mostra e não vamos implementar

- Legendas editoriais fabricadas no protótipo ("salário ainda não caiu", "gastou 8%…") viram texto derivado dos dados reais.
- O link "detalhar →" do bloco de Investimentos não tem destino no app — sai.
- A "Nota de handoff — tema claro" ao final do protótipo é documentação do handoff, não UI.

---

### Task 1: Módulo puro `lib/dashboard.ts` (TDD)

**Files:**
- Create: `frontend/src/lib/dashboard.ts`
- Test: `frontend/src/lib/dashboard.test.ts`

- [ ] **Step 1.1: Escrever os testes (vão falhar — módulo não existe)**

Create `frontend/src/lib/dashboard.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { CatLine, CategoryKind, Tx } from "../api/types";
import {
  burningRows,
  donutSlices,
  formatMultiplier,
  investBidi,
  investSummary,
  monthsBars,
  notRealized,
  paceFraction,
} from "./dashboard";

const line = (
  id: number,
  nome: string,
  real: number,
  orcado: number,
  kind: CategoryKind = "saida"
): CatLine => ({ id, nome, kind, real, orcado });

const DIAS = { decorridos: 10, no_mes: 31 }; // ~32,3% do mês

describe("paceFraction", () => {
  it("é a fração do mês já decorrida", () => {
    expect(paceFraction({ decorridos: 10, no_mes: 31 })).toBeCloseTo(0.3226, 4);
    expect(paceFraction({ decorridos: 0, no_mes: 30 })).toBe(0);
    expect(paceFraction({ decorridos: 31, no_mes: 31 })).toBe(1);
  });
  it("mês sem dias não explode", () => {
    expect(paceFraction({ decorridos: 5, no_mes: 0 })).toBe(0);
  });
});

describe("formatMultiplier", () => {
  it("some a casa decimal quando é redonda", () => {
    expect(formatMultiplier(2.03)).toBe("2");
    expect(formatMultiplier(1.39)).toBe("1,4");
    expect(formatMultiplier(1.25)).toBe("1,3");
  });
});

describe("burningRows", () => {
  const cats = [
    line(1, "Vestuário", 93870, 150000),
    line(2, "Restaurantes", 120755, 500000),
    line(3, "Impostos", 9346, 0),
    line(4, "Condomínio", 0, 250000),
    line(5, "Salário", 0, 5171200, "entrada"),
  ];

  it("só saídas com movimento entram na lista principal", () => {
    const r = burningRows(cats, DIAS);
    expect(r.rows.map((x) => x.nome)).toEqual(["Impostos", "Vestuário", "Restaurantes"]);
    expect(r.lowRows.map((x) => x.nome)).toEqual(["Condomínio", "Salário"]);
    expect(r.comMovimento).toBe(3);
    expect(r.zeradas).toBe(1); // só Condomínio: Salário é entrada, não conta
  });

  it("ordena por risco: sem orçamento primeiro, depois quem mais estourou o ritmo", () => {
    const r = burningRows(cats, DIAS);
    expect(r.rows[0].chip).toEqual({ label: "sem orçamento", tone: "over" });
    expect(r.rows[0].semOrcamento).toBe(true);
    // Vestuário: 62,6% consumido / 32,3% do mês = 1,94×
    expect(r.rows[1].chip).toEqual({ label: "1,9× o ritmo", tone: "warn" });
    expect(r.rows[1].tone).toBe("warn");
    // Restaurantes: 24,2% / 32,3% = 0,75× — dentro do ritmo, sem chip
    expect(r.rows[2].chip).toBeNull();
    expect(r.rows[2].tone).toBe("accent");
  });

  it("ordena por valor quando pedido", () => {
    const r = burningRows(cats, DIAS, "valor");
    expect(r.rows.map((x) => x.nome)).toEqual(["Restaurantes", "Vestuário", "Impostos"]);
  });

  it("calcula percentual consumido e a marca de ritmo", () => {
    const r = burningRows(cats, DIAS);
    const vest = r.rows.find((x) => x.nome === "Vestuário")!;
    expect(vest.pct).toBeCloseTo(62.58, 2);
    expect(vest.pacePct).toBeCloseTo(32.26, 2);
  });

  it("categoria sem orçamento enche a barra e não mostra denominador", () => {
    const r = burningRows([line(3, "Impostos", 9346, 0)], DIAS);
    expect(r.rows[0].pct).toBe(100);
    expect(r.rows[0].orcado).toBe(0);
  });

  it("limita a lista principal a 8 linhas e joga o resto no bloco baixo", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      line(i + 1, `Cat ${i}`, (12 - i) * 1000, 100000)
    );
    const r = burningRows(many, DIAS);
    expect(r.rows).toHaveLength(8);
    expect(r.lowRows).toHaveLength(4);
  });
});

describe("donutSlices", () => {
  it("fatia por tamanho, agrupa a cauda em Demais e acumula os offsets", () => {
    const cats = [
      line(1, "A", 5000, 0),
      line(2, "B", 3000, 0),
      line(3, "C", 1000, 0),
      line(4, "D", 400, 0),
      line(5, "E", 300, 0),
      line(6, "F", 200, 0),
      line(7, "G", 100, 0),
      line(8, "H", 100, 0),
    ];
    const d = donutSlices(cats, 10100);
    expect(d.slices.map((s) => s.nome)).toEqual(["A", "B", "C", "D", "E", "F", "Demais"]);
    expect(d.slices[0].pct).toBeCloseTo(49.5, 1);
    expect(d.slices[6].pct).toBeCloseTo(2.0, 1);
    expect(d.slices[0].from).toBe(0);
    expect(d.slices[1].from).toBeCloseTo(49.5, 1);
    expect(d.slices[6].to).toBeCloseTo(100, 5);
    expect(d.top3Pct).toBe(89);
  });

  it("sem saídas devolve lista vazia", () => {
    expect(donutSlices([], 0).slices).toEqual([]);
  });
});

describe("monthsBars", () => {
  it("altura relativa ao maior mês, média simples e projeção pelo ritmo", () => {
    const b = monthsBars(
      ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"],
      [0, 0, 40000, 980000, 970000, 460000],
      { decorridos: 10, no_mes: 31 }
    );
    expect(b.bars).toHaveLength(6);
    expect(b.bars[3].heightPct).toBe(100);
    expect(b.bars[5].heightPct).toBeCloseTo(46.94, 2);
    expect(b.bars[5].atual).toBe(true);
    expect(b.bars[0].atual).toBe(false);
    expect(b.media).toBe(408333);
    // 460000 / (10/31) = 1.426.000
    expect(b.projecao).toBe(1426000);
  });

  it("mês sem dias decorridos não projeta", () => {
    const b = monthsBars(["2026-08"], [0], { decorridos: 0, no_mes: 31 });
    expect(b.projecao).toBeNull();
    expect(b.bars[0].heightPct).toBe(0);
  });
});

describe("notRealized", () => {
  const cats = [
    line(1, "Crédito Imob.", 0, 890000),
    line(2, "Plano de saúde", 0, 880000),
    line(3, "Consórcio", 0, 360000),
    line(4, "Ajuda pais", 0, 300000),
    line(5, "Condomínio", 0, 250000),
    line(6, "IPTU", 0, 97700),
    line(7, "Vinhos", 0, 70000),
    line(8, "Mercado", 30108, 700000), // tem movimento, fica fora
    line(9, "Salário", 0, 5171200, "entrada"), // entrada, fica fora
  ];

  it("pega só saídas orçadas sem nenhum lançamento, top 5 + agregado", () => {
    const n = notRealized(cats, 459928, 5171200);
    expect(n.rows.map((r) => r.nome)).toEqual([
      "Crédito Imob.", "Plano de saúde", "Consórcio", "Ajuda pais", "Condomínio",
    ]);
    expect(n.restoCount).toBe(2);
    expect(n.restoTotal).toBe(167700);
    expect(n.total).toBe(2847700);
    expect(n.categorias).toBe(7);
  });

  it("fecha a conta do saldo projetado", () => {
    const n = notRealized(cats, 459928, 5171200);
    expect(n.saldoProjetado).toBe(5171200 - 459928 - 2847700);
  });

  it("sem nada previsto devolve zeros", () => {
    const n = notRealized([line(1, "X", 1000, 2000)], 1000, 0);
    expect(n.rows).toEqual([]);
    expect(n.total).toBe(0);
    expect(n.restoCount).toBe(0);
  });
});

describe("investSummary", () => {
  const tx = (id: number, category_id: number | null, amount_cents: number): Tx => ({
    id,
    account_id: 1,
    date: "2026-08-05",
    description: "X",
    amount_cents,
    category_id,
    source: "manual",
    installment: null,
    ignored: false,
  });

  it("separa aportes de resgates e conta os lançamentos", () => {
    const s = investSummary(
      [tx(1, 7, -100000), tx(2, 7, -5048), tx(3, 7, 100000), tx(4, 9, -50000)],
      new Set([7]),
      280000
    );
    expect(s.aportes).toBe(105048);
    expect(s.nAportes).toBe(2);
    expect(s.resgates).toBe(100000);
    expect(s.nResgates).toBe(1);
    expect(s.liquido).toBe(5048);
    expect(s.meta).toBe(280000);
    expect(s.pctMeta).toBeCloseTo(1.8, 1);
  });

  it("ignora lançamentos ignorados e sem categoria", () => {
    const ignorado = { ...tx(5, 7, -900000), ignored: true };
    const s = investSummary([ignorado, tx(6, null, -100)], new Set([7]), 0);
    expect(s.aportes).toBe(0);
    expect(s.liquido).toBe(0);
    expect(s.pctMeta).toBe(0);
  });
});

describe("investBidi", () => {
  it("aporte cresce para a direita a partir do centro", () => {
    const b = investBidi(5048, 280000);
    expect(b.leftPct).toBe(50);
    expect(b.widthPct).toBeCloseTo(0.9, 2);
  });
  it("resgate cresce para a esquerda", () => {
    const b = investBidi(-140000, 280000);
    expect(b.widthPct).toBe(25);
    expect(b.leftPct).toBe(25);
  });
  it("líquido maior que a meta satura em meia barra", () => {
    expect(investBidi(999999, 280000)).toEqual({ leftPct: 50, widthPct: 50 });
  });
  it("sem meta nem líquido não desenha nada", () => {
    expect(investBidi(0, 0)).toEqual({ leftPct: 50, widthPct: 0 });
  });
});
```

- [ ] **Step 1.2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/dashboard.test.ts`
Expected: FAIL — `Cannot find module './dashboard'`.

- [ ] **Step 1.3: Implementar o módulo**

Create `frontend/src/lib/dashboard.ts`:

```ts
import type { CatLine, Dias, Tx } from "../api/types";
import { clampPct, pctOf } from "./pct";
import type { Tone } from "./tone";

const MAX_ROWS = 8; // linhas na lista principal de "onde o dinheiro está queimando"
const MAX_SLICES = 6; // fatias nomeadas no donut; o resto vira "Demais"
const CHIP_THRESHOLD = 1.25; // a partir de quantas vezes o ritmo o chip aparece

/** Fração do mês já decorrida (0–1). É a posição da marca de ritmo. */
export function paceFraction(dias: Dias): number {
  return dias.no_mes > 0 ? dias.decorridos / dias.no_mes : 0;
}

/** "2", "1,4" — sem casa decimal quando é redonda. */
export function formatMultiplier(ratio: number): string {
  const r = Math.round(ratio * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
}

export interface BurningChip {
  label: string;
  tone: Tone;
}

export interface BurningRow {
  id: number;
  nome: string;
  real: number;
  orcado: number;
  pct: number;
  pacePct: number;
  tone: Tone;
  chip: BurningChip | null;
  semOrcamento: boolean;
}

export interface BurningView {
  rows: BurningRow[];
  lowRows: CatLine[];
  comMovimento: number;
  zeradas: number;
}

/**
 * Ordena as saídas do mês por risco (ou por valor) e monta as barras com a marca
 * de ritmo. Risco é quantas vezes o consumo do orçado passou da fração do mês já
 * decorrida — quem gastou sem orçamento nenhum vai para o topo.
 */
export function burningRows(
  categorias: CatLine[],
  dias: Dias,
  sort: "risco" | "valor" = "risco"
): BurningView {
  const pace = paceFraction(dias);
  const pacePct = pace * 100;
  const saidas = categorias.filter((c) => c.kind === "saida");
  const comMovimento = saidas.filter((c) => c.real > 0);
  const semMovimento = categorias.filter((c) => c.kind !== "saida" || c.real === 0);

  const scored = comMovimento.map((c) => {
    const semOrcamento = c.orcado <= 0;
    const consumido = semOrcamento ? 1 : c.real / c.orcado;
    const ratio = pace > 0 ? consumido / pace : consumido;
    return { line: c, semOrcamento, ratio };
  });

  scored.sort((a, b) => {
    if (sort === "valor") return b.line.real - a.line.real;
    // Sem orçamento não tem ritmo definido: vai antes de tudo.
    if (a.semOrcamento !== b.semOrcamento) return a.semOrcamento ? -1 : 1;
    if (b.ratio !== a.ratio) return b.ratio - a.ratio;
    return b.line.real - a.line.real;
  });

  const rows = scored.slice(0, MAX_ROWS).map(({ line, semOrcamento, ratio }): BurningRow => {
    let chip: BurningChip | null = null;
    if (semOrcamento) chip = { label: "sem orçamento", tone: "over" };
    else if (ratio >= CHIP_THRESHOLD)
      chip = { label: `${formatMultiplier(ratio)}× o ritmo`, tone: "warn" };
    return {
      id: line.id,
      nome: line.nome,
      real: line.real,
      orcado: line.orcado,
      pct: semOrcamento ? 100 : pctOf(line.real, line.orcado),
      pacePct,
      tone: semOrcamento ? "over" : ratio > 1 ? "warn" : "accent",
      chip,
      semOrcamento,
    };
  });

  const overflow = scored.slice(MAX_ROWS).map((s) => s.line);
  return {
    rows,
    lowRows: [...overflow, ...semMovimento],
    comMovimento: comMovimento.length,
    zeradas: semMovimento.filter((c) => c.kind === "saida").length,
  };
}

export interface DonutSlice {
  nome: string;
  cents: number;
  pct: number;
  from: number;
  to: number;
  index: number; // 0–6, escolhe o token --donut-N
}

export interface DonutView {
  slices: DonutSlice[];
  top3Pct: number;
}

/** Fatias do donut: as 6 maiores saídas + "Demais", com os offsets do conic-gradient. */
export function donutSlices(categorias: CatLine[], totalSaidas: number): DonutView {
  if (totalSaidas <= 0) return { slices: [], top3Pct: 0 };
  const saidas = categorias
    .filter((c) => c.kind === "saida" && c.real > 0)
    .sort((a, b) => b.real - a.real);

  const nomeadas = saidas.slice(0, MAX_SLICES).map((c) => ({ nome: c.nome, cents: c.real }));
  const resto = saidas.slice(MAX_SLICES).reduce((sum, c) => sum + c.real, 0);
  const partes = resto > 0 ? [...nomeadas, { nome: "Demais", cents: resto }] : nomeadas;

  let cursor = 0;
  const slices = partes.map((p, index) => {
    const pct = (p.cents / totalSaidas) * 100;
    const from = cursor;
    cursor += pct;
    return { ...p, pct, from, to: cursor, index };
  });

  const top3Pct = Math.round(slices.slice(0, 3).reduce((sum, s) => sum + s.pct, 0));
  return { slices, top3Pct };
}

export interface MonthBar {
  month: string;
  cents: number;
  heightPct: number;
  atual: boolean;
}

export interface MonthsView {
  bars: MonthBar[];
  media: number;
  maior: number;
  /** Saídas projetadas para o mês corrente se o ritmo atual se mantiver. */
  projecao: number | null;
}

export function monthsBars(months: string[], saidas: number[], dias: Dias): MonthsView {
  const maior = Math.max(0, ...saidas);
  const bars = months.map((month, i) => ({
    month,
    cents: saidas[i] ?? 0,
    heightPct: maior > 0 ? clampPct(((saidas[i] ?? 0) / maior) * 100) : 0,
    atual: i === months.length - 1,
  }));
  const media = saidas.length
    ? Math.round(saidas.reduce((a, b) => a + b, 0) / saidas.length)
    : 0;
  const pace = paceFraction(dias);
  const atual = saidas[saidas.length - 1] ?? 0;
  return { bars, media, maior, projecao: pace > 0 ? Math.round(atual / pace) : null };
}

export interface NotRealizedView {
  rows: CatLine[];
  restoCount: number;
  restoTotal: number;
  total: number;
  categorias: number;
  saldoProjetado: number;
}

/**
 * Saídas com orçamento e nenhum lançamento no mês — o que ainda está por vir se o
 * orçamento se cumprir. Não é previsão estatística: sai direto do orçado.
 */
export function notRealized(
  categorias: CatLine[],
  saidasReal: number,
  entradasOrcado: number
): NotRealizedView {
  const previstas = categorias
    .filter((c) => c.kind === "saida" && c.orcado > 0 && c.real === 0)
    .sort((a, b) => b.orcado - a.orcado);
  const rows = previstas.slice(0, 5);
  const resto = previstas.slice(5);
  const total = previstas.reduce((sum, c) => sum + c.orcado, 0);
  return {
    rows,
    restoCount: resto.length,
    restoTotal: resto.reduce((sum, c) => sum + c.orcado, 0),
    total,
    categorias: previstas.length,
    saldoProjetado: entradasOrcado - saidasReal - total,
  };
}

export interface InvestView {
  aportes: number;
  nAportes: number;
  resgates: number;
  nResgates: number;
  liquido: number;
  meta: number;
  pctMeta: number;
}

/**
 * Aporte e resgate brutos do mês. O `summary` só devolve o líquido, então isso vem
 * dos lançamentos: valor negativo é dinheiro saindo para investir (aporte).
 */
export function investSummary(
  txs: Tx[],
  investCategoryIds: Set<number>,
  meta: number
): InvestView {
  let aportes = 0;
  let resgates = 0;
  let nAportes = 0;
  let nResgates = 0;
  for (const t of txs) {
    if (t.ignored || t.category_id === null || !investCategoryIds.has(t.category_id)) continue;
    if (t.amount_cents < 0) {
      aportes += -t.amount_cents;
      nAportes += 1;
    } else if (t.amount_cents > 0) {
      resgates += t.amount_cents;
      nResgates += 1;
    }
  }
  const liquido = aportes - resgates;
  return {
    aportes,
    nAportes,
    resgates,
    nResgates,
    liquido,
    meta,
    pctMeta: pctOf(liquido, meta),
  };
}

/**
 * Barra bidirecional do líquido investido: zero no centro, aporte cresce para a
 * direita, resgate para a esquerda. A escala é a meta (ou o próprio líquido, se
 * for maior).
 */
export function investBidi(liquido: number, meta: number): { leftPct: number; widthPct: number } {
  const escala = Math.max(meta, Math.abs(liquido));
  if (escala <= 0) return { leftPct: 50, widthPct: 0 };
  const widthPct = Math.min(50, (Math.abs(liquido) / escala) * 50);
  return { leftPct: liquido < 0 ? 50 - widthPct : 50, widthPct };
}
```

- [ ] **Step 1.4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/lib/dashboard.test.ts && npx tsc --noEmit`
Expected: 21 testes PASS; tsc limpo.

- [ ] **Step 1.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/lib/dashboard.ts frontend/src/lib/dashboard.test.ts
git commit -m "feat(ui): dashboard computation module"
```

---

### Task 2: Layout do waterfall em percentuais (TDD)

**Files:**
- Modify: `frontend/src/lib/waterfall.ts`
- Modify: `frontend/src/lib/waterfall.test.ts`

O `buildWaterfall` já existe e devolve os segmentos em centavos. O bridge em CSS
precisa de `top`/`height` em porcentagem do domínio do gráfico.

- [ ] **Step 2.1: Escrever o teste novo**

Ao final de `frontend/src/lib/waterfall.test.ts`, acrescentar:

```ts
describe("waterfallLayout", () => {
  it("posiciona cada barra em % do domínio, com o topo em 0%", () => {
    const bars = buildWaterfall({
      period: "month",
      ref: "2026-08",
      months: ["2026-08"],
      start: 1000,
      steps: [{ categoria: "A", delta: -400 }, { categoria: "B", delta: 200 }],
      end: 800,
    });
    const layout = waterfallLayout(bars);
    expect(layout).toHaveLength(4);
    // domínio 0..1000 ⇒ a barra do total "Orçado" ocupa a altura toda
    expect(layout[0]).toMatchObject({ topPct: 0, heightPct: 100, kind: "total" });
    // A vai de 1000 a 600 ⇒ topo em 0%, altura 40%
    expect(layout[1]).toMatchObject({ topPct: 0, heightPct: 40, kind: "down" });
    // B vai de 600 a 800 ⇒ topo em 20%, altura 20%
    expect(layout[2]).toMatchObject({ topPct: 20, heightPct: 20, kind: "up" });
  });

  it("domínio que atravessa o zero mantém as proporções", () => {
    const bars = buildWaterfall({
      period: "month",
      ref: "2026-08",
      months: ["2026-08"],
      start: 100,
      steps: [{ categoria: "A", delta: -300 }],
      end: -200,
    });
    const layout = waterfallLayout(bars);
    // domínio -200..100 (300 de amplitude); "Orçado" ocupa de 100 a 0 ⇒ 33,3%
    expect(layout[0].heightPct).toBeCloseTo(33.33, 2);
    expect(layout[0].topPct).toBe(0);
    expect(layout[2].heightPct).toBeCloseTo(66.67, 2);
  });

  it("tudo zerado não gera NaN", () => {
    const bars = buildWaterfall({
      period: "month", ref: "2026-08", months: ["2026-08"],
      start: 0, steps: [], end: 0,
    });
    const layout = waterfallLayout(bars);
    expect(layout[0].heightPct).toBe(0);
    expect(layout[0].topPct).toBe(0);
  });
});
```

E ajustar o import no topo do arquivo para incluir a função nova:

```ts
import { buildWaterfall, waterfallLayout } from "./waterfall";
```

- [ ] **Step 2.2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/waterfall.test.ts`
Expected: FAIL — `waterfallLayout is not a function`.

- [ ] **Step 2.3: Implementar**

Ao final de `frontend/src/lib/waterfall.ts`, acrescentar:

```ts
export interface WaterfallLayoutBar {
  label: string;
  kind: WaterfallBar["kind"];
  signed: number;
  topPct: number;
  heightPct: number;
}

/**
 * Converte os segmentos em centavos para posição no gráfico: `topPct` medido do
 * topo do domínio para baixo, como o CSS espera.
 *
 * Cada segmento cobre um intervalo [lo, hi] que o `buildWaterfall` guarda partido
 * em parte positiva (basePos/pos) e negativa (baseNeg/neg, com `neg` ≤ 0), então
 * os dois extremos são reconstruídos aqui.
 */
export function waterfallLayout(bars: WaterfallBar[]): WaterfallLayoutBar[] {
  const hiOf = (b: WaterfallBar) => (b.pos > 0 ? b.basePos + b.pos : b.baseNeg);
  const loOf = (b: WaterfallBar) => (b.neg < 0 ? b.baseNeg + b.neg : b.basePos);
  const max = Math.max(0, ...bars.map(hiOf));
  const min = Math.min(0, ...bars.map(loOf));
  const span = max - min;
  return bars.map((b) => ({
    label: b.label,
    kind: b.kind,
    signed: b.signed,
    topPct: span > 0 ? ((max - hiOf(b)) / span) * 100 : 0,
    heightPct: span > 0 ? ((hiOf(b) - loOf(b)) / span) * 100 : 0,
  }));
}
```

- [ ] **Step 2.4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/lib/waterfall.test.ts && npx tsc --noEmit`
Expected: 6 testes PASS (3 antigos + 3 novos); tsc limpo.

- [ ] **Step 2.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/lib/waterfall.ts frontend/src/lib/waterfall.test.ts
git commit -m "feat(ui): waterfall layout in percentages"
```

---

### Task 3: Header com progresso do mês e strip de KPIs

**Files:**
- Create: `frontend/src/components/dashboard/MonthProgress.tsx`
- Create: `frontend/src/components/dashboard/KpiStrip.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/styles/pages.css`
- Delete: `frontend/src/components/dashboard/KpiRow.tsx`, `frontend/src/components/StatTile.tsx`

- [ ] **Step 3.1: `MonthProgress`**

Create `frontend/src/components/dashboard/MonthProgress.tsx`:

```tsx
import type { Dias } from "../../api/types";
import { paceFraction } from "../../lib/dashboard";

/** `dia 10 de 31 ▪▪▪▫▫▫ 32%` — o quanto do mês já passou, ao lado do seletor. */
export default function MonthProgress({ dias }: { dias: Dias }) {
  const pct = Math.round(paceFraction(dias) * 100);
  return (
    <div className="month-progress mono">
      <span>
        dia {dias.decorridos} de {dias.no_mes}
      </span>
      <span className="month-progress-track">
        <span className="month-progress-fill" style={{ width: `${pct}%` }} />
      </span>
      <span>{pct}%</span>
    </div>
  );
}
```

- [ ] **Step 3.2: `KpiStrip`**

Create `frontend/src/components/dashboard/KpiStrip.tsx`:

```tsx
import type { Summary } from "../../api/types";
import { formatBRL } from "../../lib/money";
import { pctOf } from "../../lib/pct";
import Money from "../Money";
import Pill from "../Pill";
import ProgressBar from "../ProgressBar";

/** Denominador das barras dos KPIs: "0% de 51.712" — sem "R$", só o número. */
const semMoeda = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export default function KpiStrip({ s }: { s: Summary }) {
  const entradasPct = pctOf(s.entradas.real, s.entradas.orcado);
  const saidasPct = pctOf(s.saidas.real, s.saidas.orcado);
  const pacePct = s.dias.no_mes > 0 ? (s.dias.decorridos / s.dias.no_mes) * 100 : 0;
  const aporte = s.investimentos.real >= 0;
  const ritmo = s.ritmo === null ? null : Math.round(s.ritmo);

  return (
    <section className="kpi-strip">
      <div className="kpi">
        <div className="label">Entradas</div>
        <div className="kpi-value">
          <Money cents={s.entradas.real} />
        </div>
        <div className="kpi-bar">
          <ProgressBar pct={entradasPct} height={3} ariaLabel="Entradas realizadas" />
          <span className="kpi-bar-note mono">
            {Math.round(entradasPct)}% de {semMoeda(s.entradas.orcado)}
          </span>
        </div>
      </div>

      <div className="kpi">
        <div className="label">Saídas</div>
        <div className="kpi-value">
          <Money cents={s.saidas.real} />
        </div>
        <div className="kpi-bar">
          <ProgressBar
            pct={saidasPct}
            pace={pacePct}
            height={3}
            ariaLabel="Saídas realizadas"
          />
          <span className="kpi-bar-note mono">
            {Math.round(saidasPct)}% de {semMoeda(s.saidas.orcado)}
          </span>
        </div>
      </div>

      <div className="kpi kpi--invest">
        <div className="label kpi-label-dot">
          <span className="swatch tone-invest" />
          Investido
        </div>
        <div className="kpi-value kpi-value-row">
          <Money cents={s.investimentos.real} alwaysSign tone={aporte ? "invest" : "over"} />
          <Pill tone={aporte ? "invest" : "over"}>{aporte ? "aporte" : "resgate"}</Pill>
        </div>
        <div className="kpi-note">líquido do mês · fora do orçamento</div>
      </div>

      <div className="kpi">
        <div className="label">Saldo</div>
        <div className="kpi-value">
          <Money cents={s.saldo.real} tone="ink" />
        </div>
        <div className="kpi-note mono">orçado {formatBRL(s.saldo.orcado)}</div>
      </div>

      <div className="kpi kpi--pace">
        <div className="label">Ritmo das saídas</div>
        <div className="kpi-value mono">
          {ritmo === null ? (
            <span className="tone-muted">—</span>
          ) : (
            <span className={ritmo > 0 ? "tone-over" : "tone-accent"}>
              {ritmo > 0 ? "+" : ritmo < 0 ? "−" : ""}
              {Math.abs(ritmo)} pts
            </span>
          )}
        </div>
        <div className="kpi-note">
          {ritmo === null
            ? "sem orçamento de saídas"
            : `gastou ${Math.round(saidasPct)}% do orçado com ${Math.round(pacePct)}% do mês corrido`}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3.3: CSS do header e do strip**

Acrescentar ao **final** de `frontend/src/styles/pages.css` (depois da seção LEGADO),
abrindo a seção do Dashboard. As tasks seguintes vão anexando os blocos delas ao fim
desta mesma seção:

```css
/* ---------- Dashboard ---------- */
.month-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}

.month-progress-track {
  width: 88px;
  height: 4px;
  border-radius: var(--r-pill);
  background: var(--track);
  position: relative;
  overflow: hidden;
}

.month-progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--muted);
  border-radius: var(--r-pill);
}

.kpi-strip {
  display: grid;
  grid-template-columns: 1fr 1fr 0.95fr 1fr 1fr;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  overflow: hidden;
  margin-bottom: var(--gap-section);
}

.kpi {
  padding: 14px 18px;
  border-right: 1px solid var(--border);
}

.kpi:last-child {
  border-right: 0;
}

.kpi--invest {
  background: var(--tint-invest);
}

.kpi--pace {
  background: var(--tint-accent);
}

.kpi-value {
  font-size: 23px;
  font-weight: 500;
  margin-top: 5px;
}

.kpi-value .money {
  font-size: 23px;
  font-weight: 500;
}

.kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.kpi-label-dot {
  display: flex;
  align-items: center;
  gap: 6px;
}

.swatch {
  width: 6px;
  height: 6px;
  border-radius: 2px;
  background: currentColor;
  flex: none;
}

.kpi-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
}

.kpi-bar .bar {
  flex: 1;
}

.kpi-bar-note,
.kpi-note {
  font-size: 11px;
  color: var(--muted);
}

.kpi-note {
  margin-top: 9px;
}
```

- [ ] **Step 3.4: Religar o `Dashboard.tsx`**

Substituir todo o conteúdo de `frontend/src/pages/Dashboard.tsx` por:

```tsx
import { useState } from "react";

import { useSummary } from "../api/hooks";
import BridgeChart from "../components/dashboard/BridgeChart";
import CategoryBars from "../components/dashboard/CategoryBars";
import EvolutionChart from "../components/dashboard/EvolutionChart";
import KpiStrip from "../components/dashboard/KpiStrip";
import LlmFeed from "../components/dashboard/LlmFeed";
import MonthProgress from "../components/dashboard/MonthProgress";
import MonthPicker from "../components/MonthPicker";
import PageHeader from "../components/PageHeader";
import { currentMonth, monthTitle } from "../lib/months";

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const { data: s, error } = useSummary(month);

  return (
    <>
      <PageHeader eyebrow="Dashboard" title={monthTitle(month)}>
        {s && <MonthProgress dias={s.dias} />}
        <MonthPicker month={month} onChange={setMonth} />
      </PageHeader>

      {error && <p className="error">Erro ao carregar resumo: {(error as Error).message}</p>}
      {!s && !error && <p className="muted">Carregando…</p>}
      {s && <KpiStrip s={s} />}

      <LlmFeed />
      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="card" style={{ flex: 2, minWidth: 340 }}>
          <CategoryBars month={month} />
        </div>
        <div className="card" style={{ flex: 1, minWidth: 260 }}>
          <EvolutionChart month={month} />
        </div>
      </div>
      <div className="card">
        <BridgeChart refMonth={month} />
      </div>
    </>
  );
}
```

- [ ] **Step 3.5: `monthTitle` em `lib/months.ts`**

O h1 do design é "Agosto 2026" — mês por extenso. Acrescentar ao final de
`frontend/src/lib/months.ts`:

```ts
const MONTH_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** "2026-08" → "Agosto 2026", para o h1 das telas mensais. */
export function monthTitle(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTH_FULL[Number(m) - 1]} ${y}`;
}
```

E o teste, ao final de `frontend/src/lib/months.test.ts`:

```ts
describe("monthTitle", () => {
  it("escreve o mês por extenso", () => {
    expect(monthTitle("2026-08")).toBe("Agosto 2026");
    expect(monthTitle("2026-01")).toBe("Janeiro 2026");
  });
});
```

Ajustar o import do teste para incluir `monthTitle` (o arquivo já importa de `./months`).

- [ ] **Step 3.6: Apagar o que saiu**

```bash
cd /home/mathe/programming/financial-tracking-platform
git rm frontend/src/components/dashboard/KpiRow.tsx frontend/src/components/StatTile.tsx
```

- [ ] **Step 3.7: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: tsc limpo (nenhum arquivo importa mais `KpiRow`/`StatTile`); **73 passed**
(48 do baseline + 21 da Task 1 + 3 da Task 2 + 1 de `monthTitle`); lint sem erros.

- [ ] **Step 3.8: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/dashboard frontend/src/pages/Dashboard.tsx frontend/src/styles/pages.css frontend/src/lib/months.ts frontend/src/lib/months.test.ts
git commit -m "feat(ui): redesigned dashboard header and kpi strip"
```

---

### Task 4: Faixa "Classificadas pelo LLM"

**Files:**
- Create: `frontend/src/components/dashboard/LlmStrip.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`, `frontend/src/styles/pages.css`
- Delete: `frontend/src/components/dashboard/LlmFeed.tsx`

Mostra os 3 lançamentos mais recentes classificados pelo LLM, link para Transações e
o botão "Confirmar todas" que existe hoje (decisão 2 do plano).

- [ ] **Step 4.1: Criar o componente**

Create `frontend/src/components/dashboard/LlmStrip.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";

import { useCategories, useFeed, usePatchTx } from "../../api/hooks";
import { formatBRL } from "../../lib/money";

const PREVIEW = 3;

/** "2026-08-06" → "06/08" */
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default function LlmStrip() {
  const { data: feed } = useFeed();
  const { data: categories } = useCategories();
  const patchTx = usePatchTx();
  const [busy, setBusy] = useState(false);
  if (!feed || feed.length === 0) return null;

  const nomes = new Map((categories ?? []).map((c) => [c.id, c.name]));

  async function confirmAll() {
    setBusy(true);
    try {
      for (const t of feed ?? []) {
        if (t.category_id !== null) {
          await patchTx.mutateAsync({ id: t.id, patch: { category_id: t.category_id } });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="llm-strip">
      <div className="llm-strip-head">
        <div className="llm-strip-title">Classificadas pelo LLM</div>
        <div className="sub">confirme e vira regra</div>
      </div>
      <div className="llm-strip-cards">
        {feed.slice(0, PREVIEW).map((t) => (
          <div key={t.id} className="llm-card">
            <div className="llm-card-main">
              <div className="llm-card-desc">{t.description}</div>
              <div className="llm-card-meta mono">
                {diaMes(t.date)} · {formatBRL(Math.abs(t.amount_cents)).replace("R$", "").trim()}
              </div>
            </div>
            <span className="chip tone-accent llm-card-chip">
              {t.category_id === null ? "sem categoria" : (nomes.get(t.category_id) ?? "—")}
            </span>
          </div>
        ))}
      </div>
      <div className="llm-strip-actions">
        <button className="ghost" onClick={confirmAll} disabled={busy}>
          {busy ? "Confirmando…" : "Confirmar todas"}
        </button>
        <Link to="/transacoes">revisar {feed.length} →</Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 4.2: CSS**

Ao final da seção "Dashboard" de `frontend/src/styles/pages.css`:

```css
.llm-strip {
  display: flex;
  align-items: center;
  gap: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 2px solid var(--warn);
  border-radius: var(--r-card);
  padding: 13px 18px;
  margin-bottom: var(--gap-section);
}

.llm-strip-head {
  flex: none;
}

.llm-strip-title {
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.llm-strip-cards {
  flex: 1;
  display: flex;
  gap: 8px;
  overflow: hidden;
}

.llm-card {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-control);
  padding: 7px 10px;
}

.llm-card-main {
  min-width: 0;
  flex: 1;
}

.llm-card-desc {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.llm-card-meta {
  font-size: 10.5px;
  color: var(--muted);
}

.llm-card-chip {
  white-space: nowrap;
  font-size: 10.5px;
}

.llm-strip-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}
```

- [ ] **Step 4.3: Religar e apagar o antigo**

Em `frontend/src/pages/Dashboard.tsx`, trocar o import
`import LlmFeed from "../components/dashboard/LlmFeed";` por
`import LlmStrip from "../components/dashboard/LlmStrip";`, e a linha `<LlmFeed />` por
`<LlmStrip />`.

```bash
cd /home/mathe/programming/financial-tracking-platform
git rm frontend/src/components/dashboard/LlmFeed.tsx
```

- [ ] **Step 4.4: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: tudo verde, 73 testes.

- [ ] **Step 4.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/dashboard frontend/src/pages/Dashboard.tsx frontend/src/styles/pages.css
git commit -m "feat(ui): llm classification strip on the dashboard"
```

---

### Task 5: Card "Onde o dinheiro está queimando" + bloco de Investimentos

**Files:**
- Create: `frontend/src/components/dashboard/BurningCard.tsx`
- Create: `frontend/src/components/dashboard/InvestBlock.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`, `frontend/src/styles/pages.css`
- Delete: `frontend/src/components/dashboard/CategoryBars.tsx`, `frontend/src/lib/investBar.ts`, `frontend/src/lib/investBar.test.ts`

- [ ] **Step 5.1: `InvestBlock`**

Create `frontend/src/components/dashboard/InvestBlock.tsx`:

```tsx
import { useCategories, useTransactions } from "../../api/hooks";
import { investBidi, investSummary } from "../../lib/dashboard";
import Money from "../Money";
import Pill from "../Pill";

/**
 * Aportes e resgates do mês. O summary só traz o líquido, então os brutos saem dos
 * lançamentos das categorias de investimento.
 */
export default function InvestBlock({ month, meta }: { month: string; meta: number }) {
  const { data: categories } = useCategories();
  const { data: txs } = useTransactions({ month });
  if (!categories || !txs) return null;

  const investIds = new Set(
    categories.filter((c) => c.kind === "investimento").map((c) => c.id)
  );
  const v = investSummary(txs, investIds, meta);
  const bar = investBidi(v.liquido, v.meta);
  const aporte = v.liquido >= 0;

  return (
    <div className="invest-block">
      <div className="invest-block-head">
        <span className="swatch tone-invest" />
        <span className="invest-block-title">Investimentos</span>
        <span className="sub">movimento de patrimônio — não conta como gasto</span>
      </div>

      <div className="invest-metrics">
        <div>
          <div className="label">Aportes</div>
          <div className="invest-metric-value">
            <Money cents={v.aportes} alwaysSign tone="invest" />
          </div>
          <div className="sub">
            {v.nAportes} {v.nAportes === 1 ? "lançamento" : "lançamentos"}
          </div>
        </div>
        <div>
          <div className="label">Resgates</div>
          <div className="invest-metric-value">
            <Money cents={-v.resgates} tone="ink-2" zeroDash />
          </div>
          <div className="sub">
            {v.nResgates} {v.nResgates === 1 ? "lançamento" : "lançamentos"}
          </div>
        </div>
        <div className="invest-metric-liquid">
          <div className="label">Líquido</div>
          <div className="invest-metric-value invest-metric-row">
            <Money cents={v.liquido} alwaysSign tone={aporte ? "invest" : "over"} />
            <Pill tone={aporte ? "invest" : "over"}>{aporte ? "aporte" : "resgate"}</Pill>
          </div>
          <div className="sub">
            {aporte ? "patrimônio cresceu no mês" : "patrimônio encolheu no mês"}
          </div>
        </div>
        <div>
          <div className="label">Meta mensal</div>
          <div className="invest-metric-value">
            <Money cents={v.meta} tone="ink-2" zeroDash />
          </div>
          <div className="sub">
            {v.meta > 0 ? `${Math.round(v.pctMeta)}% atingido` : "sem meta definida"}
          </div>
        </div>
      </div>

      <div className="invest-bidi" role="img" aria-label="Líquido investido no mês">
        <span
          className="invest-bidi-fill"
          style={{
            left: `${bar.leftPct}%`,
            width: `${bar.widthPct}%`,
            background: aporte ? "var(--invest)" : "var(--over)",
          }}
        />
        <span className="invest-bidi-zero" />
      </div>
      <div className="invest-bidi-scale">
        <span>resgate líquido</span>
        <span>0</span>
        <span>aporte líquido</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.2: `BurningCard`**

Create `frontend/src/components/dashboard/BurningCard.tsx`:

```tsx
import { useState } from "react";

import type { Dias, Summary } from "../../api/types";
import { burningRows } from "../../lib/dashboard";
import { formatBRL } from "../../lib/money";
import Money from "../Money";
import Pill from "../Pill";
import ProgressBar from "../ProgressBar";
import Segmented from "../Segmented";
import InvestBlock from "./InvestBlock";

type Sort = "risco" | "valor";

const SORT_OPTIONS = [
  { value: "risco" as const, label: "Risco" },
  { value: "valor" as const, label: "Valor" },
];

/** Denominador da linha: "/ 1.500" — sem "R$", como no design. */
const semMoeda = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export default function BurningCard({ s, month }: { s: Summary; month: string }) {
  const [sort, setSort] = useState<Sort>("risco");
  const [expanded, setExpanded] = useState(false);
  const v = burningRows(s.categorias, s.dias, sort);
  const pacePct = Math.round((s.dias.no_mes > 0 ? s.dias.decorridos / s.dias.no_mes : 0) * 100);

  return (
    <div className="card burning-card">
      <div className="card-head">
        <div>
          <h2>Onde o dinheiro está queimando</h2>
          <div className="sub">
            {v.comMovimento} categorias com movimento · {v.zeradas} zeradas
          </div>
        </div>
        <Segmented
          value={sort}
          options={SORT_OPTIONS}
          onChange={setSort}
          ariaLabel="Ordenar categorias"
        />
      </div>

      <div className="burning-legend">
        <span className="burning-legend-tick" />
        <span>marca = ritmo esperado do mês ({pacePct}%)</span>
      </div>

      <div className="burning-rows">
        {v.rows.length === 0 && <p className="muted">Sem saídas neste mês.</p>}
        {v.rows.map((r) => (
          <div key={r.id} className="burning-row">
            <div>
              <div className="burning-row-name">
                <span>{r.nome}</span>
                {r.chip && <Pill tone={r.chip.tone}>{r.chip.label}</Pill>}
              </div>
              <div className="burning-row-bar">
                {r.semOrcamento ? (
                  <div className="bar tone-over" style={{ height: 5 }}>
                    <span className="bar-hatch" />
                  </div>
                ) : (
                  <ProgressBar
                    pct={r.pct}
                    pace={r.pacePct}
                    tone={r.tone}
                    height={5}
                    ariaLabel={`${r.nome}: ${Math.round(r.pct)}% do orçado`}
                  />
                )}
              </div>
            </div>
            <div className="burning-row-values mono">
              <div>
                {formatBRL(r.real)}
                {!r.semOrcamento && (
                  <span className="tone-muted"> / {semMoeda(r.orcado)}</span>
                )}
              </div>
              <div className={`burning-row-pct tone-${r.semOrcamento ? "muted" : r.tone}`}>
                {r.semOrcamento ? "defina um orçado" : `${Math.round(r.pct)}% consumido`}
              </div>
            </div>
          </div>
        ))}
      </div>

      {expanded && v.lowRows.length > 0 && (
        <div className="burning-low">
          <div className="label">Movimento baixo</div>
          <div className="burning-low-grid">
            {v.lowRows.map((c) => (
              <div key={c.id} className="burning-low-row">
                <span>
                  {c.nome}
                  {c.kind !== "saida" && (
                    <span className={`burning-low-kind tone-${c.kind === "entrada" ? "accent" : "invest"}`}>
                      {c.kind}
                    </span>
                  )}
                </span>
                <span className="mono tone-ink-2">
                  <Money cents={c.real} zeroDash /> /{" "}
                  {c.orcado > 0 ? semMoeda(c.orcado) : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {v.lowRows.length > 0 && (
        <button className="burning-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded
            ? `Ocultar as ${v.lowRows.length} categorias sem movimento`
            : `Ver todas as ${v.rows.length + v.lowRows.length} categorias`}
        </button>
      )}

      <InvestBlock month={month} meta={s.investimentos.orcado} />
    </div>
  );
}
```

- [ ] **Step 5.3: CSS**

Ao final da seção "Dashboard" de `frontend/src/styles/pages.css`:

```css
.burning-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: var(--muted);
  margin: 10px 0 2px;
}

.burning-legend-tick {
  width: 1px;
  height: 9px;
  background: var(--pace-mark);
}

.burning-row {
  display: grid;
  grid-template-columns: 1fr 210px;
  align-items: center;
  gap: 16px;
  padding: 11px 0;
  border-bottom: 1px solid var(--divider);
}

.burning-row:last-child {
  border-bottom: 0;
}

.burning-row-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 500;
}

.burning-row-bar {
  margin-top: 7px;
}

.burning-row-values {
  text-align: right;
  font-size: 13.5px;
}

.burning-row-pct {
  font-size: 11px;
  margin-top: 3px;
}

/* Barra hachurada = gastou sem orçamento definido. */
.bar-hatch {
  position: absolute;
  inset: 0;
  border-radius: var(--r-pill);
  background: repeating-linear-gradient(
    115deg,
    currentColor 0 6px,
    transparent 6px 12px
  );
  opacity: 0.55;
}

.burning-low {
  border-top: 1px solid var(--border);
  margin-top: 6px;
  padding-top: 12px;
}

.burning-low-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px 24px;
  margin-top: 8px;
}

.burning-low-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  font-size: 12.5px;
  border-bottom: 1px solid var(--divider);
}

.burning-low-kind {
  font-size: 10px;
  margin-left: 6px;
}

.burning-toggle {
  width: 100%;
  margin-top: 12px;
  background: none;
  border: 1px solid var(--border-strong);
  border-radius: var(--r-control);
  color: var(--ink-2);
  font-size: 12px;
  padding: 8px;
}

.invest-block {
  margin-top: 14px;
  padding: 13px 14px;
  border-radius: 10px;
  background: var(--tint-invest);
  border: 1px solid var(--invest-border);
}

.invest-block-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.invest-block-title {
  font-size: 13.5px;
  font-weight: 600;
}

.invest-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr 1.15fr 1fr;
  gap: 16px;
  margin-top: 12px;
  align-items: start;
}

.invest-metric-value {
  margin-top: 3px;
  font-size: 16px;
}

.invest-metric-value .money {
  font-size: 16px;
}

.invest-metric-row {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.invest-metric-liquid {
  border-left: 1px solid var(--invest-border);
  padding-left: 14px;
}

.invest-bidi {
  position: relative;
  margin-top: 12px;
  height: 6px;
  border-radius: var(--r-pill);
  background: var(--track);
  overflow: hidden;
}

.invest-bidi-fill {
  position: absolute;
  top: 0;
  bottom: 0;
}

.invest-bidi-zero {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--pace-mark);
}

.invest-bidi-scale {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--muted);
  margin-top: 5px;
}
```

E, em `frontend/src/styles/tokens.css`, acrescentar o token da borda do bloco de
investimento — no bloco `:root` (claro):

```css
  --invest-border: rgba(69, 80, 196, 0.22);
```

e no bloco `:root[data-theme="dark"]`:

```css
  --invest-border: rgba(154, 166, 242, 0.22);
```

- [ ] **Step 5.4: Religar e apagar o antigo**

Em `frontend/src/pages/Dashboard.tsx`: trocar o import de `CategoryBars` por
`import BurningCard from "../components/dashboard/BurningCard";` e substituir o bloco

```tsx
        <div className="card" style={{ flex: 2, minWidth: 340 }}>
          <CategoryBars month={month} />
        </div>
```

por

```tsx
        <div style={{ flex: 2, minWidth: 340 }}>{s && <BurningCard s={s} month={month} />}</div>
```

```bash
cd /home/mathe/programming/financial-tracking-platform
git rm frontend/src/components/dashboard/CategoryBars.tsx frontend/src/lib/investBar.ts frontend/src/lib/investBar.test.ts
```

- [ ] **Step 5.5: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: tsc limpo; **69 passed** (73 − 4 testes do `investBar` removido); lint sem erros.

- [ ] **Step 5.6: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/dashboard frontend/src/pages/Dashboard.tsx frontend/src/styles
git commit -m "feat(ui): burning categories card with pace mark and investment block"
```

---

### Task 6: Donut de composição e barras de 6 meses

**Files:**
- Create: `frontend/src/components/dashboard/DonutCard.tsx`
- Create: `frontend/src/components/dashboard/MonthsCard.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`, `frontend/src/styles/pages.css`, `frontend/src/styles/tokens.css`
- Delete: `frontend/src/components/dashboard/EvolutionChart.tsx`

- [ ] **Step 6.1: Tokens da rampa do donut**

Em `frontend/src/styles/tokens.css`, no bloco `:root` (claro):

```css
  --donut-1: #137574;
  --donut-2: #2f7f93;
  --donut-3: #8a650f;
  --donut-4: #5a6067;
  --donut-5: #6e747b;
  --donut-6: #838990;
  --donut-7: #989ea5;
```

E no bloco `:root[data-theme="dark"]`:

```css
  --donut-1: #4fd0cf;
  --donut-2: #3fa8bd;
  --donut-3: #d9b04f;
  --donut-4: #8b8f96;
  --donut-5: #5f6a72;
  --donut-6: #4b565e;
  --donut-7: #3a444b;
```

- [ ] **Step 6.2: `DonutCard`**

Create `frontend/src/components/dashboard/DonutCard.tsx`:

```tsx
import type { Summary } from "../../api/types";
import { donutSlices } from "../../lib/dashboard";
import { formatBRL } from "../../lib/money";
import { monthLabel } from "../../lib/months";

export default function DonutCard({ s, month }: { s: Summary; month: string }) {
  const { slices, top3Pct } = donutSlices(s.categorias, s.saidas.real);

  if (slices.length === 0)
    return (
      <div className="card">
        <h2>Composição das saídas</h2>
        <div className="sub">sem saídas em {monthLabel(month)}</div>
      </div>
    );

  const gradient = slices
    .map((sl) => `var(--donut-${sl.index + 1}) ${sl.from}% ${sl.to}%`)
    .join(", ");

  return (
    <div className="card">
      <h2>Composição das saídas</h2>
      <div className="sub">
        {formatBRL(s.saidas.real)} em {monthLabel(month)}
      </div>
      <div className="donut-wrap">
        <div className="donut" style={{ background: `conic-gradient(${gradient})` }}>
          <div className="donut-hole">
            <div className="mono donut-hole-value">{top3Pct}%</div>
            <div className="donut-hole-label">
              em {Math.min(3, slices.length)}
              <br />
              categorias
            </div>
          </div>
        </div>
        <div className="donut-legend">
          {slices.map((sl) => (
            <div key={sl.nome} className="donut-legend-row">
              <span
                className="swatch donut-swatch"
                style={{ background: `var(--donut-${sl.index + 1})` }}
              />
              <span className="donut-legend-name">{sl.nome}</span>
              <span className="mono tone-ink-2">{Math.round(sl.pct)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.3: `MonthsCard`**

Create `frontend/src/components/dashboard/MonthsCard.tsx`:

```tsx
import { useSummaries } from "../../api/hooks";
import type { Dias } from "../../api/types";
import { monthsBars } from "../../lib/dashboard";
import { formatK } from "../../lib/money";
import { lastNMonths, monthLabel } from "../../lib/months";

const N_MONTHS = 6;

export default function MonthsCard({ month, dias }: { month: string; dias: Dias }) {
  const months = lastNMonths(month, N_MONTHS);
  const results = useSummaries(months);
  if (results.some((r) => !r.data)) return <div className="card muted">Carregando…</div>;

  const v = monthsBars(months, results.map((r) => r.data!.saidas.real), dias);
  const mediaPct = v.maior > 0 ? (v.media / v.maior) * 100 : 0;

  return (
    <div className="card">
      <div className="months-head">
        <h2>Saídas — {N_MONTHS} meses</h2>
        <span className="mono sub">média {formatK(v.media)}</span>
      </div>
      <div className="months-chart">
        <div className="months-media" style={{ bottom: `${mediaPct}%` }} />
        {v.bars.map((b) => (
          <div key={b.month} className="months-col">
            <span className={`mono months-col-value${b.atual ? " is-current" : ""}`}>
              {formatK(b.cents)}
            </span>
            <div
              className={`months-col-bar${b.atual ? " is-current" : ""}`}
              style={{ height: `${b.heightPct}%` }}
            />
            <span className={`months-col-label${b.atual ? " is-current" : ""}`}>
              {monthLabel(b.month).slice(0, 3)}
            </span>
          </div>
        ))}
      </div>
      {v.projecao !== null && (
        <div className="months-foot">
          Mês em curso — projeção {formatK(v.projecao)} se o ritmo se mantiver.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6.4: `formatK` em `lib/money.ts`**

Ao final de `frontend/src/lib/money.ts`:

```ts
/** Valor compacto para eixos e legendas: 460000 → "4,6k". Zero é só "0". */
export function formatK(cents: number): string {
  if (cents === 0) return "0";
  return `${(cents / 100000).toFixed(1).replace(".", ",")}k`;
}
```

E o teste, ao final de `frontend/src/lib/money.test.ts`:

```ts
describe("formatK", () => {
  it("compacta em milhares com uma casa", () => {
    expect(formatK(460000)).toBe("4,6k");
    expect(formatK(980000)).toBe("9,8k");
    expect(formatK(40000)).toBe("0,4k");
  });
  it("zero não vira 0,0k", () => {
    expect(formatK(0)).toBe("0");
  });
});
```

Ajustar o import da linha 3 para `import { formatBRL, formatK, formatSigned, parseBRL } from "./money";`.

- [ ] **Step 6.5: CSS**

Ao final da seção "Dashboard" de `frontend/src/styles/pages.css`:

```css
.donut-wrap {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 14px;
}

.donut {
  width: 118px;
  height: 118px;
  border-radius: var(--r-pill);
  flex: none;
  display: grid;
  place-items: center;
}

.donut-hole {
  width: 76px;
  height: 76px;
  border-radius: var(--r-pill);
  background: var(--surface);
  display: grid;
  place-items: center;
  text-align: center;
}

.donut-hole-value {
  font-size: 15px;
}

.donut-hole-label {
  font-size: 9.5px;
  color: var(--muted);
  line-height: 1.3;
  margin-top: 1px;
}

.donut-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  min-width: 0;
}

.donut-legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.donut-swatch {
  width: 7px;
  height: 7px;
}

.donut-legend-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.months-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.months-chart {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  height: 132px;
  margin-top: 16px;
  position: relative;
}

.months-media {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border-strong);
}

.months-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  height: 100%;
  justify-content: flex-end;
}

.months-col-value {
  font-size: 10px;
  color: var(--muted);
}

.months-col-value.is-current {
  color: var(--ink);
}

.months-col-bar {
  width: 100%;
  min-height: 1px;
  background: var(--track);
  border-radius: 3px 3px 0 0;
}

.months-col-bar.is-current {
  background: var(--accent);
}

.months-col-label {
  font-size: 10.5px;
  color: var(--muted);
}

.months-col-label.is-current {
  color: var(--ink);
  font-weight: 500;
}

.months-foot {
  font-size: 11px;
  color: var(--muted);
  margin-top: 12px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
```

> A barra dos meses não-correntes usa `--track` em vez do accent a 35% do design:
> `--track` já é exatamente "accent apagado" no escuro e legível no claro, e evita um
> token novo só para isso.

- [ ] **Step 6.6: Religar e apagar o antigo**

Em `frontend/src/pages/Dashboard.tsx`, trocar o import de `EvolutionChart` por os dois
novos e substituir o bloco

```tsx
        <div className="card" style={{ flex: 1, minWidth: 260 }}>
          <EvolutionChart month={month} />
        </div>
```

por

```tsx
        <div style={{ flex: 1, minWidth: 260 }}>
          {s && (
            <>
              <DonutCard s={s} month={month} />
              <MonthsCard month={month} dias={s.dias} />
            </>
          )}
        </div>
```

```bash
cd /home/mathe/programming/financial-tracking-platform
git rm frontend/src/components/dashboard/EvolutionChart.tsx
```

- [ ] **Step 6.7: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: **71 passed** (69 + 2 de `formatK`); tsc e lint limpos.

- [ ] **Step 6.8: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/dashboard frontend/src/pages/Dashboard.tsx frontend/src/styles frontend/src/lib/money.ts frontend/src/lib/money.test.ts
git commit -m "feat(ui): css donut and six-month bars"
```

---

### Task 7: Card "Orçado, ainda não realizado"

**Files:**
- Create: `frontend/src/components/dashboard/NotRealizedCard.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`, `frontend/src/styles/pages.css`

- [ ] **Step 7.1: Criar o componente**

Create `frontend/src/components/dashboard/NotRealizedCard.tsx`:

```tsx
import type { Summary } from "../../api/types";
import { notRealized } from "../../lib/dashboard";
import { monthName } from "../../lib/months";
import Money from "../Money";
import Pill from "../Pill";

export default function NotRealizedCard({ s, month }: { s: Summary; month: string }) {
  const v = notRealized(s.categorias, s.saidas.real, s.entradas.orcado);
  if (v.categorias === 0) return null;

  return (
    <div className="card">
      <div className="notreal-head">
        <h2>Orçado, ainda não realizado</h2>
        <Pill dashed tone="muted">
          previsto
        </Pill>
      </div>
      <div className="sub">
        {v.categorias} categorias com orçamento e nenhum lançamento em {monthName(month)}
      </div>
      <div className="notreal-total">
        <Money cents={v.total} />
      </div>

      <div className="notreal-rows">
        {v.rows.map((c) => (
          <div key={c.id} className="notreal-row">
            <span>{c.nome}</span>
            <span className="notreal-row-value">
              <span className="notreal-dash" />
              <Money cents={c.orcado} tone="ink-2" />
            </span>
          </div>
        ))}
        {v.restoCount > 0 && (
          <div className="notreal-row tone-muted">
            <span>+ {v.restoCount} categorias menores</span>
            <Money cents={v.restoTotal} tone="muted" />
          </div>
        )}
      </div>

      <div className="notreal-foot">
        <div>
          <span className="tone-muted">Já realizado</span>
          <Money cents={-s.saidas.real} tone="ink-2" />
        </div>
        <div>
          <span className="tone-muted">Previsto acima</span>
          <Money cents={-v.total} tone="ink-2" />
        </div>
        <div>
          <span className="tone-muted">Entradas orçadas</span>
          <Money cents={s.entradas.orcado} alwaysSign tone="accent" />
        </div>
        <div className="notreal-foot-total">
          <span>Saldo se o orçado se cumprir</span>
          <Money
            cents={v.saldoProjetado}
            alwaysSign
            tone={v.saldoProjetado >= 0 ? "accent" : "over"}
          />
        </div>
      </div>
      <p className="note">
        Tudo aqui vem do orçamento do mês — não é previsão. O traço pontilhado marca o que
        ainda não tem lançamento.
      </p>
    </div>
  );
}
```

- [ ] **Step 7.2: `monthName` em `lib/months.ts`**

Ao final de `frontend/src/lib/months.ts`:

```ts
/** "2026-08" → "agosto", para uso no meio de frases. */
export function monthName(month: string): string {
  return MONTH_FULL[Number(month.split("-")[1]) - 1].toLowerCase();
}
```

E o teste, dentro do `describe("monthTitle")` criado na Task 3 — na verdade um bloco
novo ao final de `frontend/src/lib/months.test.ts`:

```ts
describe("monthName", () => {
  it("devolve o mês em minúsculas para uso em frase", () => {
    expect(monthName("2026-08")).toBe("agosto");
    expect(monthName("2026-03")).toBe("março");
  });
});
```

Incluir `monthName` no import do arquivo de teste.

- [ ] **Step 7.3: CSS**

Ao final da seção "Dashboard" de `frontend/src/styles/pages.css`:

```css
.notreal-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notreal-total {
  font-size: 23px;
  font-weight: 500;
  margin-top: 10px;
}

.notreal-total .money {
  font-size: 23px;
  font-weight: 500;
}

.notreal-rows {
  display: flex;
  flex-direction: column;
  margin-top: 14px;
}

.notreal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid var(--divider);
  font-size: 12.5px;
}

.notreal-row:last-child {
  border-bottom: 0;
}

.notreal-row-value {
  display: flex;
  align-items: center;
  gap: 9px;
}

/* Traço tracejado no lugar da barra: orçado sem realizado. */
.notreal-dash {
  width: 34px;
  height: 5px;
  border-radius: var(--r-pill);
  border: 1px dashed var(--border-strong);
}

.notreal-foot {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 12px;
}

.notreal-foot > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.notreal-foot-total {
  font-weight: 600;
  padding-top: 7px;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 7.4: Religar**

Em `frontend/src/pages/Dashboard.tsx`, importar
`import NotRealizedCard from "../components/dashboard/NotRealizedCard";` e acrescentar,
logo depois de `<MonthsCard … />` dentro da coluna direita:

```tsx
              <NotRealizedCard s={s} month={month} />
```

- [ ] **Step 7.5: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: **72 passed** (71 + 1 de `monthName`); tsc e lint limpos.

- [ ] **Step 7.6: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/dashboard frontend/src/pages/Dashboard.tsx frontend/src/styles/pages.css frontend/src/lib/months.ts frontend/src/lib/months.test.ts
git commit -m "feat(ui): budgeted-but-not-realized card"
```

---

### Task 8: Bridge em waterfall CSS e saída do recharts

**Files:**
- Create: `frontend/src/components/dashboard/BridgeCard.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`, `frontend/src/styles/pages.css`, `frontend/src/theme/ThemeContext.tsx`, `frontend/package.json`
- Delete: `frontend/src/components/dashboard/BridgeChart.tsx`

- [ ] **Step 8.1: Criar o componente**

Create `frontend/src/components/dashboard/BridgeCard.tsx`:

```tsx
import { useState } from "react";

import { useBridge } from "../../api/hooks";
import { formatBRL } from "../../lib/money";
import { buildWaterfall, waterfallLayout } from "../../lib/waterfall";
import Segmented from "../Segmented";

type Period = "month" | "ytd" | "12m";

const PERIODS = [
  { value: "month" as const, label: "Mês" },
  { value: "ytd" as const, label: "YTD" },
  { value: "12m" as const, label: "12 meses" },
];

export default function BridgeCard({ refMonth }: { refMonth: string }) {
  const [period, setPeriod] = useState<Period>("month");
  const { data, error } = useBridge(period, refMonth);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Do orçado ao realizado</h2>
          {data && (
            <div className="sub">
              o que explica a diferença de {formatBRL(Math.abs(data.end - data.start))}
            </div>
          )}
        </div>
        <Segmented
          value={period}
          options={PERIODS}
          onChange={setPeriod}
          ariaLabel="Período do bridge"
        />
      </div>

      {error && <p className="error">Erro ao carregar bridge: {(error as Error).message}</p>}
      {!data && !error && <p className="muted">Carregando…</p>}

      {data && <Waterfall bars={waterfallLayout(buildWaterfall(data))} />}

      <div className="bridge-legend">
        <span>
          <span className="swatch tone-accent" />
          desvio favorável
        </span>
        <span>
          <span className="swatch tone-over" />
          desfavorável
        </span>
        <span>
          <span className="swatch tone-muted" />
          totais orçado / realizado
        </span>
      </div>
    </div>
  );
}

function Waterfall({ bars }: { bars: ReturnType<typeof waterfallLayout> }) {
  const cols = { gridTemplateColumns: `repeat(${bars.length}, 1fr)` };
  return (
    <>
      <div className="bridge-plot" style={cols}>
        <div className="bridge-grid" aria-hidden="true">
          <span style={{ top: "0%" }} />
          <span style={{ top: "25%" }} />
          <span style={{ top: "50%" }} />
          <span style={{ top: "75%" }} />
        </div>
        {bars.map((b, i) => (
          <div key={`${b.label}-${i}`} className="bridge-col">
            <span
              className={`bridge-bar bridge-bar--${b.kind}`}
              style={{ top: `${b.topPct}%`, height: `${b.heightPct}%` }}
              title={`${b.label}: ${formatBRL(b.signed)}`}
            />
          </div>
        ))}
      </div>
      <div className="bridge-labels" style={cols}>
        {bars.map((b, i) => (
          <div key={`${b.label}-${i}`} className={b.kind === "total" ? "is-total" : undefined}>
            {b.label}
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 8.2: CSS**

Ao final da seção "Dashboard" de `frontend/src/styles/pages.css`:

```css
.bridge-plot {
  display: grid;
  gap: 10px;
  height: 200px;
  margin-top: 20px;
  position: relative;
  border-bottom: 1px solid var(--border-strong);
}

.bridge-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bridge-grid span {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--divider);
}

.bridge-col {
  position: relative;
}

.bridge-bar {
  position: absolute;
  left: 0;
  right: 0;
  border-radius: 2px;
  min-height: 2px;
}

.bridge-bar--total {
  background: var(--muted);
}

.bridge-bar--up {
  background: var(--accent);
}

.bridge-bar--down {
  background: var(--over);
}

.bridge-labels {
  display: grid;
  gap: 10px;
  margin-top: 9px;
  font-size: 10.5px;
  color: var(--muted);
  text-align: center;
  line-height: 1.3;
}

.bridge-labels .is-total {
  color: var(--ink);
}

.bridge-legend {
  display: flex;
  gap: 16px;
  margin-top: 14px;
  padding-top: 11px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
}

.bridge-legend > span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bridge-legend .swatch {
  width: 8px;
  height: 8px;
}
```

- [ ] **Step 8.3: Religar e apagar o antigo**

Em `frontend/src/pages/Dashboard.tsx`, trocar o import de `BridgeChart` por
`import BridgeCard from "../components/dashboard/BridgeCard";` e substituir

```tsx
      <div className="card">
        <BridgeChart refMonth={month} />
      </div>
```

por

```tsx
      <BridgeCard refMonth={month} />
```

```bash
cd /home/mathe/programming/financial-tracking-platform
git rm frontend/src/components/dashboard/BridgeChart.tsx
```

- [ ] **Step 8.4: Remover `useThemeColors` e o `recharts`**

Em `frontend/src/theme/ThemeContext.tsx`, apagar a interface `ThemeColors` e a função
`useThemeColors` inteiras (do `export interface ThemeColors {` até o fim do arquivo).
Nenhum componente as usa depois da remoção do recharts.

```bash
cd /home/mathe/programming/financial-tracking-platform/frontend
npm uninstall recharts
```

- [ ] **Step 8.5: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: **72 passed**; tsc e lint limpos; o build **não** deve mais emitir o aviso de
chunk >500kB — o bundle sai de ~660kB para algo em torno de 300kB.

Run: `cd frontend && grep -rn "recharts\|useThemeColors" src/ package.json`
Expected: nenhuma ocorrência.

- [ ] **Step 8.6: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/dashboard frontend/src/pages/Dashboard.tsx frontend/src/styles/pages.css frontend/src/theme/ThemeContext.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat(ui): css waterfall bridge and drop recharts"
```

---

### Task 9: Grid final da página e limpeza do legado

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`, `frontend/src/styles/pages.css`

- [ ] **Step 9.1: Grid do design**

O design usa `grid-template-columns: 1.55fr 1fr` com `align-items:start`, não o `.row`
flex herdado. Substituir todo o conteúdo de `frontend/src/pages/Dashboard.tsx` por:

```tsx
import { useState } from "react";

import { useSummary } from "../api/hooks";
import BridgeCard from "../components/dashboard/BridgeCard";
import BurningCard from "../components/dashboard/BurningCard";
import DonutCard from "../components/dashboard/DonutCard";
import KpiStrip from "../components/dashboard/KpiStrip";
import LlmStrip from "../components/dashboard/LlmStrip";
import MonthProgress from "../components/dashboard/MonthProgress";
import MonthsCard from "../components/dashboard/MonthsCard";
import NotRealizedCard from "../components/dashboard/NotRealizedCard";
import MonthPicker from "../components/MonthPicker";
import PageHeader from "../components/PageHeader";
import { currentMonth, monthTitle } from "../lib/months";

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const { data: s, error } = useSummary(month);

  return (
    <>
      <PageHeader eyebrow="Dashboard" title={monthTitle(month)}>
        {s && <MonthProgress dias={s.dias} />}
        <MonthPicker month={month} onChange={setMonth} />
      </PageHeader>

      {error && <p className="error">Erro ao carregar resumo: {(error as Error).message}</p>}
      {!s && !error && <p className="muted">Carregando…</p>}

      {s && (
        <>
          <KpiStrip s={s} />
          <LlmStrip />
          <section className="dash-grid">
            <BurningCard s={s} month={month} />
            <div className="dash-col">
              <DonutCard s={s} month={month} />
              <MonthsCard month={month} dias={s.dias} />
              <NotRealizedCard s={s} month={month} />
            </div>
          </section>
          <BridgeCard refMonth={month} />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 9.2: CSS do grid**

Ao final da seção "Dashboard" de `frontend/src/styles/pages.css`:

```css
.dash-grid {
  display: grid;
  grid-template-columns: 1.55fr 1fr;
  gap: var(--gap-section);
  align-items: start;
}

/* Janela estreita: uma coluna só, como o handoff prevê para os grids. */
@media (max-width: 1180px) {
  .dash-grid {
    grid-template-columns: 1fr;
  }
}

.dash-col > .card:last-child {
  margin-bottom: 0;
}
```

- [ ] **Step 9.3: Remover o legado que o Dashboard não usa mais**

Em `frontend/src/styles/pages.css`, na seção "LEGADO", apagar os blocos `.tiles`,
`.tile`, `.tile .label`, `.tile .value`, `.tile .sub` e `.card.warn` — nenhum componente
os usa depois deste plano.

Confirmar antes de apagar:

Run: `cd frontend && grep -rn "className=\"tiles\"\|className=\"tile\|card warn" src/`
Expected: nenhuma ocorrência. Se aparecer alguma, **não apagar** o bloco correspondente.

- [ ] **Step 9.4: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: **72 passed**; tudo limpo.

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: `110 passed` (backend intocado neste plano).

- [ ] **Step 9.5: Verificação visual (skill webapp-testing)**

Com backend (8000) e vite (5173) rodando — o uvicorn **não** precisa reiniciar, nada de
backend mudou. Conferir em `http://localhost:5173/#/`:

1. **Header:** eyebrow "Dashboard", h1 "Agosto 2026", `dia N de 31` + barra + `%` em mono,
   seletor `‹ ago/26 ›`.
2. **Strip de KPIs:** 5 colunas com divisórias, Investido com fundo lilás e pill
   aporte/resgate, Ritmo com fundo teal; a barra de Saídas mostra a marca de ritmo.
3. **Faixa do LLM:** borda esquerda amarela, 3 mini-cards com ellipsis, "Confirmar todas"
   e "revisar N →" navegando para Transações.
4. **Onde o dinheiro está queimando:** segmented Risco/Valor reordenando a lista sem
   recarregar; legenda da marca; barras com tick; chips "sem orçamento" (barra hachurada)
   e "N× o ritmo"; botão de colapso abrindo o bloco "Movimento baixo" em 2 colunas.
5. **Bloco de Investimentos:** 4 métricas, barra bidirecional com o zero no centro.
   Navegar até um mês de resgate líquido e confirmar que a barra cresce para a **esquerda**
   e o pill vira "resgate" em vermelho.
6. **Donut:** fatias na rampa, furo com "N% em 3 categorias", legenda de até 7 itens.
7. **6 meses:** barra do mês corrente em accent sólido, linha de média, rodapé de projeção.
8. **Orçado, ainda não realizado:** pill tracejado, top 5 com traço tracejado, agregado e
   as 4 linhas de fechamento.
9. **Bridge:** 11 colunas, primeira e última em cinza, favoráveis em teal, desfavoráveis
   em vermelho; alternar Mês/YTD/12 meses recarrega.
10. Screenshot da página inteira em dark e em light; console sem erros.

- [ ] **Step 9.6: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/pages/Dashboard.tsx frontend/src/styles/pages.css
git commit -m "feat(ui): dashboard two-column grid and legacy css cleanup"
```

- [ ] **Step 9.7: Revisão de código**

Usar a skill code-review sobre o conjunto de commits deste plano (preferência do
usuário: sem revisor por task, uma revisão ao final).
