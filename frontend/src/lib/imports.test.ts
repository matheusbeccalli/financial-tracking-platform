import { describe, expect, it } from "vitest";

import type { ImportBatch } from "../api/types";
import { batchTotals, dupSplit, fileBadge, formatKB, whenLabel } from "./imports";

const batch = (id: number, new_count: number, dup_count: number): ImportBatch => ({
  id,
  filename: `f${id}.ofx`,
  source: "ofx",
  imported_at: "2026-08-07T15:27:33",
  new_count,
  dup_count,
});

describe("fileBadge", () => {
  it("extensão em maiúsculas", () => {
    expect(fileBadge("Bradesco_09082026_101204.ofx")).toBe("OFX");
    expect(fileBadge("Bradesco_982026_094410 AM.csv")).toBe("CSV");
    expect(fileBadge("EXTRATO.OFX")).toBe("OFX");
  });

  it("sem extensão vira interrogação", () => {
    expect(fileBadge("extrato")).toBe("?");
  });
});

describe("formatKB", () => {
  it("KB inteiro, mínimo 1", () => {
    expect(formatKB(145_408)).toBe("142 KB");
    expect(formatKB(512)).toBe("1 KB");
  });

  it("acima de 1 MB usa MB com uma casa", () => {
    expect(formatKB(1_572_864)).toBe("1,5 MB");
  });
});

describe("whenLabel", () => {
  it("dd/mm hh:mm", () => {
    expect(whenLabel("2026-08-07T15:27:33")).toBe("07/08 15:27");
  });
});

describe("batchTotals", () => {
  it("soma novas e duplicadas de todos os lotes", () => {
    const t = batchTotals([batch(1, 178, 0), batch(2, 76, 2), batch(3, 0, 93)]);
    expect(t.novas).toBe(254);
    expect(t.dup).toBe(95);
  });

  it("lista vazia zera", () => {
    expect(batchTotals([])).toEqual({ novas: 0, dup: 0 });
  });
});

describe("dupSplit", () => {
  it("divide a barra pela proporção de novas", () => {
    const s = dupSplit(57, 2);
    expect(s.novasPct).toBeCloseTo(96.61, 1);
    expect(s.dupPct).toBeCloseTo(3.39, 1);
  });

  it("tudo novo é barra cheia; tudo duplicado é barra cinza", () => {
    expect(dupSplit(93, 0)).toEqual({ novasPct: 100, dupPct: 0 });
    expect(dupSplit(0, 93)).toEqual({ novasPct: 0, dupPct: 100 });
  });

  it("lote vazio cai no cinza, sem NaN", () => {
    expect(dupSplit(0, 0)).toEqual({ novasPct: 0, dupPct: 100 });
  });
});
