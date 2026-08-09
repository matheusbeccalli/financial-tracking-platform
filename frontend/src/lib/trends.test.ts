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
    dias: { decorridos: 0, no_mes: 30 },
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
