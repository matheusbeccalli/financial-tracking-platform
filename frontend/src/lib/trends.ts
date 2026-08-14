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
  /** Desvio % do orçado do mês atual sobre a média; null sem média positiva. */
  desvio: number | null;
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

/** Limiar (em %) para chip de desvio e tons de alerta — o mesmo em toda a tela. */
export const LIMIAR_DESVIO = 25;

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

/**
 * Saídas: o que mais desvia do histórico primeiro; sem histórico por último.
 * Derivado dos dados, não do texto do chip — mudar a copy não pode mudar a ordem.
 */
const desvioKey = (r: TrendsRow) => {
  if (r.semHist) return -2;
  if (r.desvio === null) return -1;
  if ((r.plan[0] ?? 0) === 0) return Number.MAX_SAFE_INTEGER; // com média, sem orçado
  return Math.abs(r.desvio);
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
    // Só desvio percentual de verdade: "sem orçado" não é desvio (a legenda do KPI
    // promete "desvio acima de 25% entre orçado e média").
    foraDaMedia: m.rows.saida.filter(
      (r) =>
        r.desvio !== null &&
        (r.plan[0] ?? 0) > 0 &&
        Math.abs(r.desvio) >= LIMIAR_DESVIO
    ).length,
    semHist: semHistRows.length,
    semHistOrcado: semHistRows.reduce((sum, r) => sum + (r.plan[0] ?? 0), 0),
  };
}
