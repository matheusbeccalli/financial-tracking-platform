import { describe, expect, it } from "vitest";

import { addMonths, lastNMonths, monthLabel, monthName, monthTitle } from "./months";

describe("addMonths", () => {
  it("navega entre meses e anos", () => {
    expect(addMonths("2026-08", 1)).toBe("2026-09");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("monthLabel", () => {
  it("abrevia em pt-BR", () => {
    expect(monthLabel("2026-08")).toBe("ago/26");
  });
});

describe("lastNMonths", () => {
  it("retorna janela terminando no mês dado", () => {
    expect(lastNMonths("2026-03", 3)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});

describe("monthTitle", () => {
  it("escreve o mês por extenso", () => {
    expect(monthTitle("2026-08")).toBe("Agosto 2026");
    expect(monthTitle("2026-01")).toBe("Janeiro 2026");
  });
});

describe("monthName", () => {
  it("devolve o mês em minúsculas para uso em frase", () => {
    expect(monthName("2026-08")).toBe("agosto");
    expect(monthName("2026-03")).toBe("março");
  });
});
