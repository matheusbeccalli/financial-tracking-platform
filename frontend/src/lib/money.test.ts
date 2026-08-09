import { describe, expect, it } from "vitest";

import { formatBRL, formatSigned, parseBRL } from "./money";

// toLocaleString pt-BR usa espaco nao-quebravel (U+00A0) entre R$ e o numero
const clean = (s: string) => s.replace(/\u00a0/g, " ");

describe("formatBRL", () => {
  it("formata centavos como BRL", () => {
    expect(clean(formatBRL(150000))).toBe("R$ 1.500,00");
    expect(clean(formatBRL(-18740))).toBe("-R$ 187,40");
    expect(clean(formatBRL(0))).toBe("R$ 0,00");
  });
});

describe("parseBRL", () => {
  it("aceita formatos brasileiros", () => {
    expect(parseBRL("1.500,00")).toBe(150000);
    expect(parseBRL("R$ 187,40")).toBe(18740);
    expect(parseBRL("42")).toBe(4200);
  });
  it("rejeita entrada inválida", () => {
    expect(parseBRL("abc")).toBeNull();
    expect(parseBRL("")).toBeNull();
  });
  it("rejeita ponto ambíguo e aceita milhar válido", () => {
    expect(parseBRL("1.5")).toBeNull();
    expect(parseBRL("1.500")).toBe(150000);
    expect(parseBRL("1.234.567,89")).toBe(123456789);
  });
});

describe("formatSigned", () => {
  it("usa o traço tipográfico no negativo", () => {
    expect(clean(formatSigned(-459928))).toBe("−R$ 4.599,28");
  });
  it("com alwaysSign, positivo ganha +", () => {
    expect(clean(formatSigned(5048, true))).toBe("+R$ 50,48");
    expect(clean(formatSigned(5048))).toBe("R$ 50,48");
  });
  it("zero nunca ganha sinal", () => {
    expect(clean(formatSigned(0, true))).toBe("R$ 0,00");
  });
});
