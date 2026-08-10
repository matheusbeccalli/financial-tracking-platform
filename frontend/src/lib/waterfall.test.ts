import { describe, expect, it } from "vitest";

import { buildWaterfall, waterfallLayout, waterfallZeroPct } from "./waterfall";

const bridge = {
  period: "month",
  ref: "2026-08",
  months: ["2026-08"],
  start: 700000,
  steps: [
    { categoria: "Mercado", delta: -28000 },
    { categoria: "Salário", delta: 10000 },
  ],
  end: 682000,
};

describe("buildWaterfall", () => {
  it("gera segmentos positivos quando tudo é positivo", () => {
    const bars = buildWaterfall(bridge);
    expect(bars[0]).toMatchObject({
      label: "Orçado", basePos: 0, pos: 700000, baseNeg: 0, neg: 0,
      kind: "total", signed: 700000,
    });
    expect(bars[1]).toMatchObject({
      label: "Mercado", basePos: 672000, pos: 28000, baseNeg: 0, neg: 0,
      kind: "down", signed: -28000,
    });
    expect(bars[3]).toMatchObject({ label: "Realizado", basePos: 0, pos: 682000 });
  });

  it("divide em segmento negativo e positivo quando o acumulado cruza zero", () => {
    const deficit = {
      ...bridge,
      start: -50000,
      steps: [{ categoria: "Salário", delta: 120000 }],
      end: 70000,
    };
    const bars = buildWaterfall(deficit);
    expect(bars[0]).toMatchObject({
      label: "Orçado", basePos: 0, pos: 0, baseNeg: 0, neg: -50000, signed: -50000,
    });
    // passo cruza de -50000 a +70000: parte negativa -50000→0, positiva 0→70000
    expect(bars[1]).toMatchObject({
      label: "Salário", basePos: 0, pos: 70000, baseNeg: 0, neg: -50000,
      kind: "up", signed: 120000,
    });
    expect(bars[2]).toMatchObject({ label: "Realizado", pos: 70000, neg: 0 });
  });

  it("passo inteiramente negativo empilha para baixo", () => {
    const b = { ...bridge, start: -10000, steps: [{ categoria: "Lazer", delta: -30000 }], end: -40000 };
    const bars = buildWaterfall(b);
    expect(bars[1]).toMatchObject({
      label: "Lazer", basePos: 0, pos: 0, baseNeg: -10000, neg: -30000, kind: "down",
    });
  });
});

describe("waterfallLayout", () => {
  it("posiciona cada barra em % do domínio, com o topo em 0%", () => {
    const bars = buildWaterfall({
      period: "month",
      ref: "2026-08",
      months: ["2026-08"],
      start: 1000,
      steps: [
        { categoria: "A", delta: -400 },
        { categoria: "B", delta: 200 },
      ],
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
      period: "month",
      ref: "2026-08",
      months: ["2026-08"],
      start: 0,
      steps: [],
      end: 0,
    });
    const layout = waterfallLayout(bars);
    expect(layout[0].heightPct).toBe(0);
    expect(layout[0].topPct).toBe(0);
  });
});

describe("waterfallZeroPct", () => {
  it("null quando o domínio não atravessa o zero", () => {
    const bars = buildWaterfall({
      period: "month", ref: "2026-08", months: ["2026-08"],
      start: 1000, steps: [{ categoria: "A", delta: -200 }], end: 800,
    });
    expect(waterfallZeroPct(bars)).toBeNull();
  });

  it("posiciona o zero quando o realizado fica negativo", () => {
    const bars = buildWaterfall({
      period: "month", ref: "2026-08", months: ["2026-08"],
      start: 100, steps: [{ categoria: "A", delta: -300 }], end: -200,
    });
    // domínio -200..100 ⇒ zero a 100/300 do topo
    expect(waterfallZeroPct(bars)).toBeCloseTo(33.33, 2);
  });
});
