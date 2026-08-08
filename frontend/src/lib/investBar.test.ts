import { describe, expect, it } from "vitest";

import { investBarView } from "./investBar";

describe("investBarView", () => {
  it("progresso normal em direção à meta", () => {
    expect(investBarView(150000, 200000)).toEqual({
      pct: 75,
      met: false,
      negative: false,
    });
  });

  it("meta atingida ou superada é sucesso, não estouro", () => {
    expect(investBarView(200000, 200000)).toEqual({ pct: 100, met: true, negative: false });
    expect(investBarView(250000, 200000)).toEqual({ pct: 100, met: true, negative: false });
  });

  it("líquido negativo (resgatou mais que aportou): barra vazia", () => {
    expect(investBarView(-50000, 200000)).toEqual({ pct: 0, met: false, negative: true });
    expect(investBarView(-50000, 0)).toEqual({ pct: 0, met: false, negative: true });
  });

  it("sem meta: barra cheia se aportou, vazia se não", () => {
    expect(investBarView(100000, 0)).toEqual({ pct: 100, met: false, negative: false });
    expect(investBarView(0, 0)).toEqual({ pct: 0, met: false, negative: false });
  });
});
