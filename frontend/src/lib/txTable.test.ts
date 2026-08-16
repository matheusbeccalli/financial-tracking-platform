import { describe, expect, it } from "vitest";

import type { CategoryKind, Tx } from "../api/types";
import { accountCounts, filterTxs, sortTxs, statusCounts, summarize } from "./txTable";

function tx(partial: Partial<Tx> & { id: number }): Tx {
  return {
    account_id: 1,
    date: "2026-07-10",
    description: "X",
    amount_cents: -1000,
    category_id: null,
    source: null,
    installment: null,
    ignored: false,
    ...partial,
  };
}

const LOOKUPS = {
  accountName: new Map([
    [1, "Bradesco Conta"],
    [2, "Inter Conta"],
  ]),
  categoryName: new Map([
    [10, "Alimentação"],
    [20, "Transporte"],
  ]),
};

describe("summarize", () => {
  const KINDS = new Map<number, CategoryKind>([
    [10, "saida"],
    [20, "saida"],
    [30, "investimento"],
    [40, "entrada"],
  ]);

  it("soma entradas, saídas e saldo, ignoradas fora", () => {
    const s = summarize(
      [
        tx({ id: 1, amount_cents: 850000, category_id: 40 }),
        tx({ id: 2, amount_cents: -30000, category_id: 10 }),
        tx({ id: 3, amount_cents: -20000, category_id: 20 }),
        tx({ id: 4, amount_cents: -99900, ignored: true }),
      ],
      KINDS
    );
    expect(s).toEqual({
      count: 3,
      entradas: 850000,
      saidas: 50000,
      investido: 0,
      saldo: 800000,
      temIgnoradas: true,
    });
  });

  it("lista vazia zera tudo", () => {
    expect(summarize([], KINDS)).toEqual({
      count: 0,
      entradas: 0,
      saidas: 0,
      investido: 0,
      saldo: 0,
      temIgnoradas: false,
    });
  });

  it("resgate de investimento não vira entrada (caso registrado)", () => {
    const s = summarize([tx({ id: 1, amount_cents: 5048, category_id: 30 })], KINDS);
    expect(s.entradas).toBe(0);
    expect(s.investido).toBe(-5048); // resgate líquido
    expect(s.saldo).toBe(5048); // variação de caixa preservada
  });

  it("aporte é investido positivo e sai do saldo", () => {
    const s = summarize(
      [
        tx({ id: 1, amount_cents: 850000, category_id: 40 }),
        tx({ id: 2, amount_cents: -200000, category_id: 30 }),
      ],
      KINDS
    );
    expect(s).toMatchObject({ entradas: 850000, investido: 200000, saldo: 650000 });
  });

  it("estorno em categoria de entrada reduz entradas, como no backend", () => {
    const s = summarize(
      [
        tx({ id: 1, amount_cents: 850000, category_id: 40 }),
        tx({ id: 2, amount_cents: -10000, category_id: 40 }),
      ],
      KINDS
    );
    expect(s.entradas).toBe(840000);
    expect(s.saidas).toBe(0);
  });

  it("sem categoria e id desconhecido caem por sinal (uncat_in/uncat_out)", () => {
    const s = summarize(
      [
        tx({ id: 1, amount_cents: 5000, category_id: null }),
        tx({ id: 2, amount_cents: -3000, category_id: 999 }),
      ],
      KINDS
    );
    expect(s).toMatchObject({ entradas: 5000, saidas: 3000, investido: 0 });
  });
});

describe("sortTxs", () => {
  const txs = [
    tx({ id: 1, date: "2026-07-20", amount_cents: -5000, account_id: 2, category_id: 20 }),
    tx({ id: 2, date: "2026-07-01", amount_cents: 850000, account_id: 1, category_id: 10 }),
    tx({ id: 3, date: "2026-07-10", amount_cents: -100, account_id: 1, category_id: null }),
  ];

  it("ordena por data nos dois sentidos sem mutar a original", () => {
    const asc = sortTxs(txs, "date", "asc", LOOKUPS);
    expect(asc.map((t) => t.id)).toEqual([2, 3, 1]);
    expect(sortTxs(txs, "date", "desc", LOOKUPS).map((t) => t.id)).toEqual([1, 3, 2]);
    expect(txs[0].id).toBe(1); // original intacta
  });

  it("ordena por valor", () => {
    expect(sortTxs(txs, "amount_cents", "asc", LOOKUPS).map((t) => t.id)).toEqual([
      1, 3, 2,
    ]);
  });

  it("ordena conta e categoria pelo nome; sem categoria vai para o fim", () => {
    expect(sortTxs(txs, "account", "asc", LOOKUPS).map((t) => t.id)).toEqual([2, 3, 1]);
    expect(sortTxs(txs, "category", "asc", LOOKUPS).map((t) => t.id)).toEqual([2, 1, 3]);
    expect(sortTxs(txs, "category", "desc", LOOKUPS).map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("ordena por descrição", () => {
    const rows = [
      tx({ id: 1, description: "Zoo" }),
      tx({ id: 2, description: "água" }),
      tx({ id: 3, description: "Mercado" }),
    ];
    expect(sortTxs(rows, "description", "asc", LOOKUPS).map((t) => t.id)).toEqual([
      2, 3, 1,
    ]);
  });

  it("ordena por origem; origem nula vai para o fim nos dois sentidos", () => {
    const rows = [
      tx({ id: 1, source: null }),
      tx({ id: 2, source: "regra" }),
      tx({ id: 3, source: "llm" }),
    ];
    expect(sortTxs(rows, "source", "asc", LOOKUPS).map((t) => t.id)).toEqual([3, 2, 1]);
    expect(sortTxs(rows, "source", "desc", LOOKUPS).map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("categoria com id fora do lookup ordena como vazio: primeiro no asc, não no fim", () => {
    const rows = [tx({ id: 1, category_id: 999 }), tx({ id: 2, category_id: 10 })];
    expect(sortTxs(rows, "category", "asc", LOOKUPS).map((t) => t.id)).toEqual([1, 2]);
  });
});

describe("filterTxs", () => {
  const txs = [
    tx({ id: 1, account_id: 1, category_id: 10, source: "regra" }),
    tx({ id: 2, account_id: 1, category_id: null, source: null }),
    tx({ id: 3, account_id: 2, category_id: 11, source: "llm" }),
    tx({ id: 4, account_id: 2, category_id: 10, source: "llm" }),
  ];
  const todos = { accountId: null, categoryId: null, status: "todas" as const };

  it("sem filtro devolve tudo", () => {
    expect(filterTxs(txs, todos)).toHaveLength(4);
  });

  it("filtra por conta", () => {
    expect(filterTxs(txs, { ...todos, accountId: 2 }).map((t) => t.id)).toEqual([3, 4]);
  });

  it("filtra por categoria", () => {
    expect(filterTxs(txs, { ...todos, categoryId: 10 }).map((t) => t.id)).toEqual([1, 4]);
  });

  it("status llm pega o que o LLM classificou e ninguém confirmou", () => {
    expect(filterTxs(txs, { ...todos, status: "llm" }).map((t) => t.id)).toEqual([3, 4]);
  });

  it("status sem-categoria pega o que não tem categoria", () => {
    expect(filterTxs(txs, { ...todos, status: "sem-categoria" }).map((t) => t.id)).toEqual([2]);
  });

  it("combina os filtros", () => {
    expect(
      filterTxs(txs, { accountId: 2, categoryId: 10, status: "llm" }).map((t) => t.id)
    ).toEqual([4]);
  });
});

describe("accountCounts", () => {
  it("conta lançamentos por conta", () => {
    const counts = accountCounts([
      tx({ id: 1, account_id: 1 }),
      tx({ id: 2, account_id: 1 }),
      tx({ id: 3, account_id: 2 }),
    ]);
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(1);
    expect(counts.get(9)).toBeUndefined();
  });
});

describe("statusCounts", () => {
  it("conta a classificar e sem categoria", () => {
    const c = statusCounts([
      tx({ id: 1, category_id: 10, source: "regra" }),
      tx({ id: 2, category_id: null, source: null }),
      tx({ id: 3, category_id: 11, source: "llm" }),
      tx({ id: 4, category_id: null, source: "llm" }),
    ]);
    expect(c.llm).toBe(2);
    expect(c.semCategoria).toBe(2);
  });
});
