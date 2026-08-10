import { describe, expect, it } from "vitest";

import type { Category, CategoryKind } from "../api/types";
import { budgetTotals, expenseRows } from "./budget";

const cat = (id: number, name: string, kind: CategoryKind = "saida"): Category => ({
  id,
  name,
  kind,
  color: "#888",
  archived: false,
});

const CATS = [
  cat(1, "Crédito Imobiliário"),
  cat(2, "Mercado"),
  cat(3, "Aula Padel"),
  cat(4, "Impostos & Taxas"),
  cat(5, "Educação"),
  cat(10, "Salário", "entrada"),
  cat(11, "Rendimentos", "entrada"),
  cat(12, "Outras Entradas", "entrada"),
  cat(20, "Investimentos", "investimento"),
];

// orçado por categoria
const ORC = new Map([
  [1, 890000],
  [2, 70000],
  [3, 110000],
  [10, 5171200],
  [20, 280000],
]);

// realizado por categoria
const REAL = new Map([[4, 9346]]);

describe("expenseRows", () => {
  it("separa saídas com e sem orçamento", () => {
    const v = expenseRows(CATS, ORC, REAL, "valor");
    expect(v.comOrcamento.map((r) => r.nome)).toEqual([
      "Crédito Imobiliário",
      "Aula Padel",
      "Mercado",
    ]);
    expect(v.semOrcamento.map((r) => r.nome)).toEqual(["Educação", "Impostos & Taxas"]);
  });

  it("ordena por nome quando pedido, respeitando acentos", () => {
    const v = expenseRows(CATS, ORC, REAL, "nome");
    expect(v.comOrcamento.map((r) => r.nome)).toEqual([
      "Aula Padel",
      "Crédito Imobiliário",
      "Mercado",
    ]);
  });

  it("a barra é o peso relativo à maior linha", () => {
    const v = expenseRows(CATS, ORC, REAL, "valor");
    expect(v.comOrcamento[0].pesoPct).toBe(100);
    expect(v.comOrcamento[2].pesoPct).toBeCloseTo(7.87, 2); // 70000/890000
  });

  it("destaca as linhas grandes (≥ R$ 3.000)", () => {
    const v = expenseRows(CATS, ORC, REAL, "valor");
    expect(v.comOrcamento[0].destaque).toBe(true); // 8.900
    expect(v.comOrcamento[1].destaque).toBe(false); // 1.100
  });

  it("mostra o que já foi gasto nas categorias sem orçamento", () => {
    const v = expenseRows(CATS, ORC, REAL, "valor");
    const impostos = v.semOrcamento.find((r) => r.nome === "Impostos & Taxas")!;
    expect(impostos.jaGasto).toBe(9346);
    const educacao = v.semOrcamento.find((r) => r.nome === "Educação")!;
    expect(educacao.jaGasto).toBe(0);
  });

  it("o bloco sem orçamento é sempre alfabético; o aviso de gasto é visual", () => {
    const v = expenseRows(CATS, ORC, REAL, "valor");
    expect(v.semOrcamento.map((r) => r.nome)).toEqual(["Educação", "Impostos & Taxas"]);
    // a ordenação escolhida não afeta este bloco
    const porNome = expenseRows(CATS, ORC, REAL, "nome");
    expect(porNome.semOrcamento.map((r) => r.nome)).toEqual(
      v.semOrcamento.map((r) => r.nome)
    );
  });

  it("total das saídas soma só o orçado", () => {
    const v = expenseRows(CATS, ORC, REAL, "valor");
    expect(v.total).toBe(890000 + 110000 + 70000);
  });

  it("categoria arquivada fica fora", () => {
    const arch = { ...cat(9, "Velha"), archived: true };
    const v = expenseRows([...CATS, arch], ORC, REAL, "valor");
    expect(v.comOrcamento.concat(v.semOrcamento).some((r) => r.nome === "Velha")).toBe(
      false
    );
  });

  it("sem nenhuma saída orçada não divide por zero", () => {
    const v = expenseRows([cat(1, "X")], new Map(), new Map(), "valor");
    expect(v.comOrcamento).toEqual([]);
    expect(v.semOrcamento[0].pesoPct).toBe(0);
    expect(v.total).toBe(0);
  });
});

describe("budgetTotals", () => {
  it("separa saldo operacional de saldo líquido", () => {
    const t = budgetTotals(CATS, ORC);
    expect(t.entradas).toBe(5171200);
    expect(t.saidas).toBe(1070000);
    expect(t.investimento).toBe(280000);
    expect(t.operacional).toBe(5171200 - 1070000);
    expect(t.liquido).toBe(5171200 - 1070000 - 280000);
  });

  it("conta linhas de entrada preenchidas e categorias de saída orçadas", () => {
    const t = budgetTotals(CATS, ORC);
    expect(t.entradasPreenchidas).toBe(1);
    expect(t.entradasLinhas).toBe(3);
    expect(t.saidasCategorias).toBe(3);
  });

  it("percentuais sobre as entradas", () => {
    const t = budgetTotals(CATS, ORC);
    expect(t.saidasPctEntradas).toBeCloseTo(20.69, 2);
    expect(t.investPctEntradas).toBeCloseTo(5.41, 2);
  });

  it("sem entradas orçadas os percentuais são zero, não infinito", () => {
    const t = budgetTotals(CATS, new Map([[2, 70000]]));
    expect(t.entradas).toBe(0);
    expect(t.saidasPctEntradas).toBe(0);
    expect(t.investPctEntradas).toBe(0);
  });
});
