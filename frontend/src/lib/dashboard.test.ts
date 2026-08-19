import { describe, expect, it } from "vitest";

import type { CatLine, CategoryKind, Tx } from "../api/types";
import {
  burningRows,
  donutSlices,
  formatMultiplier,
  investBidi,
  investLabel,
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

  it("estouro do orçado não é travado em 100% e vira tom over", () => {
    const r = burningRows([line(1, "Vestuário", 250000, 100000)], DIAS);
    expect(r.rows[0].pct).toBe(250);
    expect(r.rows[0].tone).toBe("over");
    expect(r.rows[0].chip).toEqual({ label: "estourou o orçado", tone: "over" });
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

  it("saídas fora de `categorias` viram fatia própria e fecham em 100%", () => {
    // total inclui lançamentos sem categoria / arquivados que não têm linha
    const d = donutSlices([line(1, "A", 7000, 0)], 10000);
    expect(d.slices.map((s) => s.nome)).toEqual(["A", "Sem categoria"]);
    expect(d.slices[1].pct).toBe(30);
    expect(d.slices[1].to).toBe(100);
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

  it("mês já fechado não projeta", () => {
    const b = monthsBars(["2026-07"], [970000], { decorridos: 31, no_mes: 31 });
    expect(b.projecao).toBeNull();
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
      "Crédito Imob.",
      "Plano de saúde",
      "Consórcio",
      "Ajuda pais",
      "Condomínio",
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
    duplicate_of_id: null,
    duplicate_of: null,
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

describe("investLabel", () => {
  it("zero não é aporte nem resgate", () => {
    expect(investLabel(0)).toBeNull();
  });
  it("sinal define rótulo e tom", () => {
    expect(investLabel(5048)).toEqual({ label: "aporte", tone: "invest" });
    expect(investLabel(-5048)).toEqual({ label: "resgate", tone: "over" });
  });
});
