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
