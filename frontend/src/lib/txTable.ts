import type { Tx } from "../api/types";

export interface TxSummary {
  count: number;
  entradas: number;
  saidas: number;
  saldo: number;
  temIgnoradas: boolean;
}

export function summarize(txs: Tx[]): TxSummary {
  let entradas = 0;
  let saidas = 0;
  let count = 0;
  let temIgnoradas = false;
  for (const t of txs) {
    if (t.ignored) {
      temIgnoradas = true;
      continue;
    }
    count += 1;
    if (t.amount_cents > 0) entradas += t.amount_cents;
    else saidas += -t.amount_cents;
  }
  return { count, entradas, saidas, saldo: entradas - saidas, temIgnoradas };
}

export type SortKey =
  | "date"
  | "description"
  | "account"
  | "amount_cents"
  | "category"
  | "source";

export type SortDir = "asc" | "desc";

export interface SortLookups {
  accountName: Map<number, string>;
  categoryName: Map<number, string>;
}

const collate = (a: string, b: string) =>
  a.localeCompare(b, "pt-BR", { sensitivity: "base" });

export function sortTxs(
  txs: Tx[],
  key: SortKey,
  dir: SortDir,
  lookups: SortLookups
): Tx[] {
  const sign = dir === "asc" ? 1 : -1;
  // nulos (categoria/origem) sempre no fim, independentemente da direção
  const cmp = (a: Tx, b: Tx): number => {
    switch (key) {
      case "date":
        return sign * collate(a.date, b.date);
      case "description":
        return sign * collate(a.description, b.description);
      case "amount_cents":
        return sign * (a.amount_cents - b.amount_cents);
      case "account":
        return (
          sign *
          collate(
            lookups.accountName.get(a.account_id) ?? String(a.account_id),
            lookups.accountName.get(b.account_id) ?? String(b.account_id)
          )
        );
      case "category": {
        const an = a.category_id === null ? null : lookups.categoryName.get(a.category_id) ?? "";
        const bn = b.category_id === null ? null : lookups.categoryName.get(b.category_id) ?? "";
        if (an === null || bn === null) return an === bn ? 0 : an === null ? 1 : -1;
        return sign * collate(an, bn);
      }
      case "source": {
        if (a.source === null || b.source === null)
          return a.source === b.source ? 0 : a.source === null ? 1 : -1;
        return sign * collate(a.source, b.source);
      }
    }
  };
  return [...txs].sort(cmp);
}
