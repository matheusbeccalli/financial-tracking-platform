import { describe, expect, it } from "vitest";

import { buildWaterfall } from "./waterfall";

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
