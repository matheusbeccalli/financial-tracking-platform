import { describe, expect, it } from "vitest";

import { describeProgress } from "./ClassificationStatus";
import type { ClassificationProgress } from "../api/types";

const base = { total: 10, done: 4, counts: { regra: 1, llm: 3, pendente: 6 } };

describe("describeProgress", () => {
  it("running mostra X/Y", () => {
    const p: ClassificationProgress = { ...base, status: "running" };
    expect(describeProgress(p)).toBe("classificando 4/10…");
  });

  it("done mostra contagens finais", () => {
    const p: ClassificationProgress = { ...base, status: "done" };
    expect(describeProgress(p)).toBe(
      "classificadas: 1 por regra, 3 pelo LLM, 6 pendentes"
    );
  });

  it("interrupted e error apontam para reclassificar", () => {
    expect(
      describeProgress({ ...base, status: "interrupted" })
    ).toContain("Reclassificar pendentes");
    expect(describeProgress({ ...base, status: "error" })).toContain(
      "Reclassificar pendentes"
    );
  });
});
