import { describe, expect, it } from "vitest";

import type { Tx } from "../api/types";
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
  it("soma entradas, saídas e saldo, ignoradas fora", () => {
    const s = summarize([
      tx({ id: 1, amount_cents: 850000 }),
      tx({ id: 2, amount_cents: -30000 }),
      tx({ id: 3, amount_cents: -20000 }),
      tx({ id: 4, amount_cents: -99900, ignored: true }),
    ]);
    expect(s).toEqual({
      count: 3,
      entradas: 850000,
      saidas: 50000,
      saldo: 800000,
      temIgnoradas: true,
    });
  });

  it("lista vazia zera tudo", () => {
    expect(summarize([])).toEqual({
      count: 0,
      entradas: 0,
      saidas: 0,
      saldo: 0,
      temIgnoradas: false,
    });
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
