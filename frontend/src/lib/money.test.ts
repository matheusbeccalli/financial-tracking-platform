import { describe, expect, it } from "vitest";

import { formatBRL, parseBRL } from "./money";

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
});
