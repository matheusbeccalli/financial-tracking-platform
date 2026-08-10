import { describe, expect, it } from "vitest";

import { clampPct, pctOf, pctRaw } from "./pct";

describe("clampPct", () => {
  it("mantém o valor dentro de 0–100", () => {
    expect(clampPct(63)).toBe(63);
    expect(clampPct(-10)).toBe(0);
    expect(clampPct(180)).toBe(100);
  });
  it("trata não-número como zero", () => {
    expect(clampPct(NaN)).toBe(0);
    expect(clampPct(Infinity)).toBe(100);
  });
});

describe("pctOf", () => {
  it("calcula a fração em percentual", () => {
    expect(pctOf(93870, 150000)).toBeCloseTo(62.58, 2);
  });
  it("denominador zero ou negativo vira zero", () => {
    expect(pctOf(1000, 0)).toBe(0);
    expect(pctOf(1000, -500)).toBe(0);
  });
  it("estouro satura em 100", () => {
    expect(pctOf(200000, 150000)).toBe(100);
  });
});

describe("pctRaw", () => {
  it("não satura em 100", () => {
    expect(pctRaw(250000, 100000)).toBe(250);
    expect(pctRaw(1000, 0)).toBe(0);
  });
});
