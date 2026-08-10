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

  comOrcamento.sort(
    sort === "valor" ? (a, b) => b.cents - a.cents || porNome(a, b) : porNome
  );

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
