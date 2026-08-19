import { describe, expect, it } from "vitest";

import type { InstallmentsProjection } from "../api/types";
import { installmentsKpis, monthStatuses } from "./installments";

const base: InstallmentsProjection = {
  month: "2026-07",
  months: ["2026-08", "2026-09", "2026-10"],
  categorias: [
    {
      id: 1,
      nome: "Mercado",
      parcelas: [45000, 45000, 45000],
      orcado: [40000, 60000, 50000],
      status: ["estouro", "ok", "risco"],
    },
    {
      id: null,
      nome: "Sem categoria",
      parcelas: [10000, 0, 0],
      orcado: [null, null, null],
      status: ["ok", "ok", "ok"],
    },
  ],
  totais: [55000, 45000, 45000],
  series: [
    { tx_id: 1, descricao: "A", conta: "c", categoria_id: 1, categoria_nome: "Mercado",
      numero: 3, total: 10, valor: 45000, termina_em: "2027-02", restante: 315000 },
    { tx_id: 2, descricao: "B", conta: "c", categoria_id: null, categoria_nome: null,
      numero: 2, total: 3, valor: 10000, termina_em: "2026-08", restante: 10000 },
  ],
};

describe("monthStatuses", () => {
  it("pega o pior status de cada coluna", () => {
    expect(monthStatuses(base)).toEqual(["estouro", "ok", "risco"]);
  });
});

describe("installmentsKpis", () => {
  it("soma restante, conta compras e meses alertados", () => {
    expect(installmentsKpis(base)).toEqual({
      restanteTotal: 325000,
      comprasAtivas: 2,
      mesesEstouro: 1,
      mesesRisco: 1,
    });
  });
  it("vazio zera tudo", () => {
    const vazio = { ...base, months: [], categorias: [], totais: [], series: [] };
    expect(installmentsKpis(vazio)).toEqual({
      restanteTotal: 0, comprasAtivas: 0, mesesEstouro: 0, mesesRisco: 0,
    });
  });
});
