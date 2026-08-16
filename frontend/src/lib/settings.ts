import type { Account, Category, CategoryKind, Rule } from "../api/types";
import { collatePt } from "./collate";

const porName = (a: { name: string }, b: { name: string }) => collatePt(a.name, b.name);

/** Rótulos dos kinds — única fonte para pills, options e segmented desta tela. */
export const KIND_LABELS: Record<CategoryKind, string> = {
  saida: "saída",
  entrada: "entrada",
  investimento: "investimento",
};

/** Categorias agrupadas por kind, alfabéticas. Arquivadas só entram com a flag. */
export function groupByKind(
  categories: Category[],
  showArchived: boolean
): Record<CategoryKind, Category[]> {
  const groups: Record<CategoryKind, Category[]> = {
    entrada: [],
    saida: [],
    investimento: [],
  };
  for (const c of categories) {
    if (!showArchived && c.archived) continue;
    groups[c.kind].push(c);
  }
  for (const kind of Object.keys(groups) as CategoryKind[]) groups[kind].sort(porName);
  return groups;
}

export interface AccountGroup {
  institution: string;
  accounts: Account[];
}

// Agrupamento e contagem por instituição são case-insensitive: o formulário grava em
// minúsculas, mas nada garante isso para contas criadas por fora (API, seed).
export function groupAccounts(accounts: Account[]): AccountGroup[] {
  const map = new Map<string, Account[]>();
  for (const a of accounts) {
    const key = a.institution.toLowerCase();
    const list = map.get(key) ?? [];
    list.push(a);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => collatePt(a, b))
    .map(([institution, list]) => ({ institution, accounts: [...list].sort(porName) }));
}

/** "4 contas em 2 instituições", com singular quando for o caso. */
export function accountsSummary(accounts: Account[]): string {
  const n = accounts.length;
  const i = new Set(accounts.map((a) => a.institution.toLowerCase())).size;
  return `${n} ${n === 1 ? "conta" : "contas"} em ${i} ${i === 1 ? "instituição" : "instituições"}`;
}

/** Busca client-side: casa o matcher ou o nome da categoria, sem case. */
export function filterRules(rules: Rule[], categories: Category[], q: string): Rule[] {
  const query = q.trim().toLowerCase();
  if (!query) return rules;
  const nome = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
  return rules.filter(
    (r) =>
      r.matcher.toLowerCase().includes(query) ||
      (nome.get(r.category_id) ?? "").includes(query)
  );
}
