import { describe, expect, it } from "vitest";

import { ApiError } from "../api/client";
import type { ImportBatch } from "../api/types";
import {
  batchBadge,
  batchTotals,
  dupSplit,
  fileBadge,
  formatKB,
  IMPORT_ACCEPT,
  IMPORT_EXT_RE,
  IMPORT_EXTS,
  pollInterval,
  whenLabel,
} from "./imports";

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
  it("trata o naive do backend como UTC e formata no fuso local", () => {
    // constrói o esperado com o mesmo fuso do ambiente de teste
    const d = new Date("2026-08-07T15:27:33Z");
    const p = (n: number) => String(n).padStart(2, "0");
    expect(whenLabel("2026-08-07T15:27:33")).toBe(
      `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
    );
  });

  it("respeita offset explícito quando houver", () => {
    const d = new Date("2026-08-07T15:27:33-03:00");
    const p = (n: number) => String(n).padStart(2, "0");
    expect(whenLabel("2026-08-07T15:27:33-03:00")).toBe(
      `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
    );
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

describe("pollInterval", () => {
  it("continua a 1500ms enquanto roda, sem erro", () => {
    expect(pollInterval("running", null)).toBe(1500);
  });

  it("erro transiente (rede, 5xx) NÃO para o polling", () => {
    expect(pollInterval("running", new TypeError("failed to fetch"))).toBe(1500);
    expect(pollInterval("running", new ApiError("boom", 500))).toBe(1500);
  });

  it("404 para: o lote foi desfeito e não volta", () => {
    expect(pollInterval("running", new ApiError("Lote não encontrado", 404))).toBe(false);
  });

  it("terminou (done/error/interrupted) para", () => {
    expect(pollInterval("done", null)).toBe(false);
    expect(pollInterval("error", null)).toBe(false);
    expect(pollInterval(undefined, null)).toBe(false);
  });
});

describe("extensões de importação", () => {
  it("regex aceita as extensões sem case, rejeita o resto", () => {
    expect(IMPORT_EXT_RE.test("extrato.OFX")).toBe(true);
    expect(IMPORT_EXT_RE.test("fatura.csv")).toBe(true);
    expect(IMPORT_EXT_RE.test("nota.txt")).toBe(false);
    expect(IMPORT_EXT_RE.test("ofx")).toBe(false); // precisa do ponto
  });

  it("accept do input deriva da mesma lista", () => {
    expect(IMPORT_ACCEPT).toBe(IMPORT_EXTS.map((e) => `.${e}`).join(","));
  });
});

describe("batchBadge", () => {
  it("lote pluggy ganha badge OF (filename sintético não tem extensão)", () => {
    expect(batchBadge({ source: "pluggy", filename: "Pluggy · Bradesco Conta · 2026-08-16" })).toBe("OF");
  });
  it("lote de arquivo continua usando a extensão", () => {
    expect(batchBadge({ source: "ofx", filename: "extrato.ofx" })).toBe("OFX");
  });
});
