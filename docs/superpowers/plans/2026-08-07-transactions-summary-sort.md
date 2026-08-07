# Transactions Summary & Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Linha de resumo dinâmica (contagem, entradas, saídas, saldo) e ordenação por coluna na tela de Transações, tudo client-side.

**Architecture:** Helpers puros em `src/lib/txTable.ts` (`summarize`, `sortTxs`) testados no Vitest; `Transactions.tsx` consome via `useMemo` com estado de ordenação local.

**Tech Stack:** React/TS/Vitest. Sem backend, sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-08-07-transactions-summary-sort-design.md`

---

## File Structure

- Create: `frontend/src/lib/txTable.ts` — `summarize` + `sortTxs` + tipos
- Create: `frontend/src/lib/txTable.test.ts`
- Modify: `frontend/src/pages/Transactions.tsx` — resumo + cabeçalhos ordenáveis

Contexto para o executor:

- Branch de trabalho: `feature/transactions-summary-sort` (criar a partir de `main` se ainda não existir).
- Comandos do frontend, a partir de `frontend/`: `npm test -- --run`
  (hoje: 21 testes) e `npm run build` (typecheck).
- `Tx` está em `frontend/src/api/types.ts` (campos: `id, account_id, date,
  description, amount_cents, category_id, source, installment, ignored`;
  `amount_cents` negativo = saída). `formatBRL(cents)` em
  `frontend/src/lib/money.ts`. Hook `useCategories` em
  `frontend/src/api/hooks.ts` retorna `Category[] = {id, name, ...}`.
- A página atual (`Transactions.tsx`) já monta `accountName: Map<number,
  string>`; leia o arquivo antes de editar.

---

### Task 1: Helpers + tela

**Files:**
- Create: `frontend/src/lib/txTable.test.ts`
- Create: `frontend/src/lib/txTable.ts`
- Modify: `frontend/src/pages/Transactions.tsx`

- [ ] **Step 1: Write the failing tests**

Criar `frontend/src/lib/txTable.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npm test -- --run`
Expected: FAIL (módulo `./txTable` não existe)

- [ ] **Step 3: Implement `txTable.ts`**

Criar `frontend/src/lib/txTable.ts`:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- --run`
Expected: todos verdes (21 anteriores + 6 novos)

- [ ] **Step 5: Wire into `Transactions.tsx`**

Ler o arquivo atual e aplicar:

1. Imports novos:

```ts
import { useMemo, useState } from "react";
import { useAccounts, useCategories, usePatchTx, useTransactions } from "../api/hooks";
import { sortTxs, summarize, type SortDir, type SortKey } from "../lib/txTable";
```

(remover o import antigo de `useState` isolado e o de hooks sem `useCategories`.)

2. Dentro do componente, após os hooks existentes:

```ts
  const { data: categories } = useCategories();
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const lookups = useMemo(
    () => ({
      accountName: new Map((accounts ?? []).map((a) => [a.id, a.name])),
      categoryName: new Map((categories ?? []).map((c) => [c.id, c.name])),
    }),
    [accounts, categories]
  );
  const rows = useMemo(
    () => (txs && sort ? sortTxs(txs, sort.key, sort.dir, lookups) : txs ?? []),
    [txs, sort, lookups]
  );
  const summary = useMemo(() => summarize(txs ?? []), [txs]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }
```

Substituir a `const accountName = new Map(...)` existente por
`const accountName = lookups.accountName;` (a tabela já a usa).

3. Cabeçalho ordenável — adicionar um componente local no mesmo arquivo
   (fora do componente principal):

```tsx
function SortableTh({
  label,
  k,
  sort,
  onSort,
  className,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: SortDir } | null;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === k;
  return (
    <th
      className={className}
      onClick={() => onSort(k)}
      style={{ cursor: "pointer", userSelect: "none" }}
      title="Ordenar"
    >
      {label} {active ? (sort!.dir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}
```

4. No JSX: trocar os 6 `<th>` de dados por `SortableTh` (`date`,
   `description`, `account`, `amount_cents` com `className="num"`,
   `category`, `source`; o `<th></th>` de ações permanece), trocar
   `txs.map((t) => …)` por `rows.map((t) => …)` e, acima da `<table>`
   (dentro do card, junto das mensagens de loading/vazio), adicionar:

```tsx
        {txs && txs.length > 0 && (
          <p className="muted">
            {summary.count} transações · entradas {formatBRL(summary.entradas)} ·
            saídas {formatBRL(-summary.saidas)} ·{" "}
            <span className={summary.saldo > 0 ? "pos" : undefined}>
              saldo {formatBRL(summary.saldo)}
            </span>
            {summary.temIgnoradas && " (ignoradas fora da soma)"}
          </p>
        )}
```

Nota: `saidas` é valor absoluto; `formatBRL(-summary.saidas)` exibe com sinal
negativo como na tabela.

- [ ] **Step 6: Test + typecheck**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: verde e build limpo.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/txTable.ts frontend/src/lib/txTable.test.ts frontend/src/pages/Transactions.tsx
git commit -m "feat(ui): dynamic totals and column sorting on transactions page"
```

---

### Task 2: Verificação visual

- [ ] Rebuild (`cd frontend && npm run build`) e conferir em
  `http://localhost:8000/` (tela Transações): resumo correto com filtros
  mudando, clique nos cabeçalhos alternando ▲/▼, ignoradas fora da soma com
  o checkbox ligado. Usar a skill `webapp-testing` (Playwright) para
  screenshot/verificação se disponível.
