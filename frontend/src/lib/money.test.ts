import { describe, expect, it } from "vitest";

import { formatBRL, formatK, formatSigned, formatUnits, parseBRL } from "./money";

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

describe("formatK", () => {
  it("compacta em milhares com uma casa", () => {
    expect(formatK(460000)).toBe("4,6k");
    expect(formatK(980000)).toBe("9,8k");
    expect(formatK(40000)).toBe("0,4k");
  });
  it("zero não vira 0,0k", () => {
    expect(formatK(0)).toBe("0");
  });
});

describe("formatUnits", () => {
  it("sem R$ e sem centavos, com separador de milhar", () => {
    expect(formatUnits(5171200)).toBe("51.712");
    expect(formatUnits(459928)).toBe("4.599");
  });
  it("arredonda em vez de virar 0,0k como o formatK", () => {
    expect(formatUnits(1)).toBe("0");
    expect(formatUnits(-5048)).toBe("-50");
  });
});
