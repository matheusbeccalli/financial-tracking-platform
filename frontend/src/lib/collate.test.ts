import { describe, expect, it } from "vitest";

import { collatePt, porNome } from "./collate";

describe("collatePt", () => {
  it("ignora caixa e acento", () => {
    expect(collatePt("Água", "agua")).toBe(0);
    expect(["Étage", "abacaxi", "Zebra"].sort(collatePt)).toEqual([
      "abacaxi",
      "Étage",
      "Zebra",
    ]);
  });
});

describe("porNome", () => {
  it("ordena objetos pelo campo nome", () => {
    const rows = [{ nome: "Zebra" }, { nome: "água" }];
    expect([...rows].sort(porNome).map((r) => r.nome)).toEqual(["água", "Zebra"]);
  });
});
