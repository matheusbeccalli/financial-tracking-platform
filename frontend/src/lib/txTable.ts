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

/**
 * "A classificar" é o que o LLM chutou e ninguém confirmou (`source === "llm"`);
 * "sem categoria" é o que nem regra nem LLM resolveram.
 */
export type TxStatus = "todas" | "llm" | "sem-categoria";

export interface TxFilterState {
  accountId: number | null;
  categoryId: number | null;
  status: TxStatus;
}

export function filterTxs(txs: Tx[], f: TxFilterState): Tx[] {
  return txs.filter((t) => {
    if (f.accountId !== null && t.account_id !== f.accountId) return false;
    if (f.categoryId !== null && t.category_id !== f.categoryId) return false;
    if (f.status === "llm" && t.source !== "llm") return false;
    if (f.status === "sem-categoria" && t.category_id !== null) return false;
    return true;
  });
}

export function accountCounts(txs: Tx[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const t of txs) counts.set(t.account_id, (counts.get(t.account_id) ?? 0) + 1);
  return counts;
}

export function statusCounts(txs: Tx[]): { llm: number; semCategoria: number } {
  let llm = 0;
  let semCategoria = 0;
  for (const t of txs) {
    if (t.source === "llm") llm += 1;
    if (t.category_id === null) semCategoria += 1;
  }
  return { llm, semCategoria };
}
