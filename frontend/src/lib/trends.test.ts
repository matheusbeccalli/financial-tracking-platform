import { describe, expect, it } from "vitest";

import type { Category, CategoryKind, Summary } from "../api/types";
import {
  applyOrder,
  buildTrends,
  desvioChip,
  mediana,
  trendsStrip,
  trendsWindow,
  type TrendsRow,
} from "./trends";

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
    expect(m.rows.saida[0].desvio).toBe(100);
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

  it("chip 'sem orçado' não conta como fora da média (não há desvio sem orçado)", () => {
    const cats = [cat(1, "Mercado", "saida"), cat(6, "Streaming", "saida")];
    const s1 = mkSummary("2026-01", {
      saidas: [100000, 0],
      categorias: [line(1, "saida", 60000), line(6, "saida", 40000)],
    });
    const p1 = mkSummary("2026-02", {
      saidas: [0, 60000],
      categorias: [line(1, "saida", 0, 60000)],
    });
    const m = buildTrends(1, [s1, p1], cats);
    // Streaming tem histórico e nenhum orçado: ganha o chip, mas não entra no KPI
    expect(m.rows.saida.find((r) => r.nome === "Streaming")!.chip).toEqual({
      label: "sem orçado",
      tone: "over",
    });
    expect(trendsStrip(m).foraDaMedia).toBe(0); // Mercado desvia 0%
  });
});

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
