import type { CatLine, Dias, Tx } from "../api/types";
import { clampPct, pctOf, pctRaw } from "./pct";
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
    const pct = semOrcamento ? 100 : pctRaw(line.real, line.orcado);
    const estourou = !semOrcamento && pct > 100;
    let chip: BurningChip | null = null;
    if (semOrcamento) chip = { label: "sem orçamento", tone: "over" };
    else if (estourou) chip = { label: "estourou o orçado", tone: "over" };
    else if (ratio >= CHIP_THRESHOLD)
      chip = { label: `${formatMultiplier(ratio)}× o ritmo`, tone: "warn" };
    return {
      id: line.id,
      nome: line.nome,
      real: line.real,
      orcado: line.orcado,
      pct,
      pacePct,
      tone: semOrcamento || estourou ? "over" : ratio > 1 ? "warn" : "accent",
      chip,
      semOrcamento,
    };
  });

  // `outras` junta o que sobrou das 8 primeiras linhas com tudo que não é saída
  // com movimento — não é "sem movimento", é "o resto".
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

  // `saidas.real` do backend soma lançamentos sem categoria e categorias arquivadas,
  // que não têm linha em `categorias`. Sem esta fatia o conic-gradient pararia antes
  // de 100% e o CSS esticaria a última cor até o fim, desenhando-a maior do que o
  // percentual escrito ao lado dela.
  const somaFatias = partes.reduce((sum, p) => sum + p.cents, 0);
  const foraDeCategoria = totalSaidas - somaFatias;
  if (foraDeCategoria > 0) partes.push({ nome: "Sem categoria", cents: foraDeCategoria });

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
  // Projetar só faz sentido num mês em curso. Mês fechado tem decorridos == no_mes
  // (projeção seria o próprio realizado, com a legenda "mês em curso" mentindo);
  // mês futuro tem decorridos == 0.
  const emCurso = dias.decorridos > 0 && dias.decorridos < dias.no_mes;
  const pace = paceFraction(dias);
  const atual = saidas[saidas.length - 1] ?? 0;
  return { bars, media, maior, projecao: emCurso && pace > 0 ? Math.round(atual / pace) : null };
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
export function investBidi(
  liquido: number,
  meta: number
): { leftPct: number; widthPct: number } {
  const escala = Math.max(meta, Math.abs(liquido));
  if (escala <= 0) return { leftPct: 50, widthPct: 0 };
  const widthPct = Math.min(50, (Math.abs(liquido) / escala) * 50);
  return { leftPct: liquido < 0 ? 50 - widthPct : 50, widthPct };
}

/** Rótulo do líquido investido. Zero não é aporte nem resgate. */
export function investLabel(liquido: number): { label: string; tone: Tone } | null {
  if (liquido === 0) return null;
  return liquido > 0
    ? { label: "aporte", tone: "invest" }
    : { label: "resgate", tone: "over" };
}
