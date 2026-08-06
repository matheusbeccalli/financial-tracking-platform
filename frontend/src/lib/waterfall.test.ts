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
  it("gera barras com base flutuante e totais ancorados em zero", () => {
    const bars = buildWaterfall(bridge);
    expect(bars[0]).toEqual({ label: "Orçado", base: 0, value: 700000, kind: "total" });
    expect(bars[1]).toEqual({ label: "Mercado", base: 672000, value: 28000, kind: "down" });
    expect(bars[2]).toEqual({ label: "Salário", base: 672000, value: 10000, kind: "up" });
    expect(bars[3]).toEqual({ label: "Realizado", base: 0, value: 682000, kind: "total" });
  });
});
