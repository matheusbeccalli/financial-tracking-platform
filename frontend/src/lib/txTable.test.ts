import { describe, expect, it } from "vitest";

import type { Tx } from "../api/types";
import { sortTxs, summarize } from "./txTable";

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
