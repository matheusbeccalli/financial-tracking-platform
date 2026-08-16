import { describe, expect, it } from "vitest";

import { syncFromSuggestion, todayISO } from "./pluggy";

describe("todayISO", () => {
  it("formata a data local em YYYY-MM-DD", () => {
    expect(todayISO(new Date(2026, 7, 16, 23, 30))).toBe("2026-08-16");
  });
});

describe("syncFromSuggestion", () => {
  it("sugere o dia seguinte à última transação", () => {
    expect(syncFromSuggestion("2026-07-30", "2026-08-16")).toBe("2026-07-31");
  });
  it("vira o mês corretamente", () => {
    expect(syncFromSuggestion("2026-07-31", "2026-08-16")).toBe("2026-08-01");
  });
  it("conta sem transações sugere hoje", () => {
    expect(syncFromSuggestion(undefined, "2026-08-16")).toBe("2026-08-16");
  });
});
