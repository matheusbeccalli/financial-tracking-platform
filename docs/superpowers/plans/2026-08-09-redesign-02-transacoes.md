# Redesign — Plano 02: Transações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a tela de Transações conforme o protótipo `Transacoes.dc.html` do bundle de handoff (local, não versionado) — barra de filtros com chips de conta e de estado, strip de totais, tabela com chip de categoria no lugar dos `<select>` nativos, seleção múltipla e barra de ações flutuante.

**Architecture:** A busca e o recorte de mês continuam no servidor; conta, categoria e estado passam a ser filtrados no cliente, porque os chips precisam mostrar a **contagem** de cada conta e de cada estado — e isso exige ter o conjunto do mês inteiro em mãos. Toda essa lógica (filtro, contagens) entra em `lib/txTable.ts`, que já hospeda `summarize`/`sortTxs`, testada com vitest. O chip de categoria é um `<span>` estilizado com um `<select>` nativo transparente por cima: visual do design, comportamento e acessibilidade nativos, zero código de popover. A página se divide em componentes sob `components/transactions/`.

**Tech Stack:** React 19 + TypeScript, TanStack Query, vitest, CSS puro com os tokens e primitivos dos planos 00 e 01. Sem backend novo.

**Spec:** `docs/superpowers/specs/2026-08-09-frontend-redesign-design.md`

**Baseline antes de começar:** frontend 81 testes, backend 110 testes, ambos verdes, em `a297d73`.

### Decisões tomadas para este plano

1. **Sem agrupamento por dia.** A tabela fica plana, com a **coluna Data de volta** e **ordenação por coluna** preservada (`sortTxs` e seus testes ficam). Isso é um desvio deliberado do design, que agrupava por dia com subtotal diário e eliminava a coluna Data.
2. **Chip de categoria com `<select>` nativo invisível por cima.** O ruído que o design ataca é visual e some; o comportamento continua sendo o do navegador.
3. **O filtro por categoria fica**, fora do desenho — é o caminho direto do Dashboard ("esta categoria está queimando") para as linhas dela.
4. **Sem "Criar regra" na barra flutuante** — `classifier.py:92-96` já cria ou atualiza a regra a cada correção de categoria; o botão prometeria uma ação que já acontece sozinha.
5. **Sem endpoint em lote.** "Categorizar" e "Ignorar" na barra flutuante emitem N `PATCH` sequenciais, com estado ocupado enquanto rodam.

### Semântica dos dois chips de estado

- **"A classificar N"** (`--warn`) = `source === "llm"`: o LLM chutou e ninguém confirmou. **Não** é a mesma contagem do "revisar N →" do Dashboard: aquele vem de `/dashboard/feed`, que é global e limitado a 20, sem recorte de mês (`routers/dashboard.py:22-30`). Este conta só o mês aberto.
- **"Sem categoria N"** = `category_id === null`: nem regra nem LLM acertaram.

---

### Task 1: Filtros e contagens em `lib` (TDD)

**Files:**
- Modify: `frontend/src/lib/months.ts`, `frontend/src/lib/months.test.ts`
- Modify: `frontend/src/lib/txTable.ts`, `frontend/src/lib/txTable.test.ts`
- Modify: `frontend/src/components/dashboard/LlmStrip.tsx` (passa a usar o helper compartilhado)

- [ ] **Step 1.1: Escrever os testes**

Ao final de `frontend/src/lib/months.test.ts` (e incluir `dayMonth` no import de `./months`):

```ts
describe("dayMonth", () => {
  it("formata a data ISO como dia/mês", () => {
    expect(dayMonth("2026-08-04")).toBe("04/08");
    expect(dayMonth("2026-12-31")).toBe("31/12");
  });
});
```

Ao final de `frontend/src/lib/txTable.test.ts` (incluir `accountCounts`, `filterTxs` e
`statusCounts` no import de `./txTable`):

```ts
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
```

O arquivo de teste já tem um helper de construção de `Tx`. Se o nome dele não for `tx`,
usar o existente em vez de criar outro.

- [ ] **Step 1.2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/txTable.test.ts src/lib/months.test.ts`
Expected: FAIL — `filterTxs is not a function`, `dayMonth is not a function`.

- [ ] **Step 1.3: Implementar**

Ao final de `frontend/src/lib/months.ts`:

```ts
/** "2026-08-04" → "04/08". Data curta em mono, como o design pede nas tabelas. */
export function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
```

Ao final de `frontend/src/lib/txTable.ts`:

```ts
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
```

- [ ] **Step 1.4: `LlmStrip` usa o helper compartilhado**

Em `frontend/src/components/dashboard/LlmStrip.tsx`, apagar a constante local

```tsx
/** "2026-08-06" → "06/08" */
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
```

acrescentar `dayMonth` ao import de `../../lib/months` (criando o import se não houver) e
trocar `{diaMes(t.date)}` por `{dayMonth(t.date)}`.

- [ ] **Step 1.5: Rodar e ver passar**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: **90 passed** (81 + 1 de `dayMonth` + 6 de `filterTxs` + 1 de `accountCounts` + 1 de `statusCounts`).

- [ ] **Step 1.6: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/lib frontend/src/components/dashboard/LlmStrip.tsx
git commit -m "feat(ui): transaction filters and counts module"
```

---

### Task 2: `CategoryChip` — chip com select nativo por cima

**Files:**
- Create: `frontend/src/components/CategoryChip.tsx`
- Modify: `frontend/src/styles/components.css`

- [ ] **Step 2.1: Criar o componente**

Create `frontend/src/components/CategoryChip.tsx`:

```tsx
import { useCategories } from "../api/hooks";

/**
 * Chip de categoria com um `<select>` nativo transparente por cima: o visual é o do
 * design, mas quem abre a lista, navega por teclado e anuncia para leitores de tela
 * é o controle nativo. Os 29 selects visíveis eram o maior ruído da tela — o ruído
 * era visual, não o comportamento.
 */
export default function CategoryChip({
  value,
  onChange,
  ariaLabel,
  emptyLabel = "sem categoria",
  allowEmpty = false,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  ariaLabel: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
}) {
  const { data: categories } = useCategories();
  const options = (categories ?? []).filter((c) => !c.archived);
  const atual = value === null ? null : options.find((c) => c.id === value);
  const tone = atual?.kind === "investimento" ? " tone-invest" : "";

  return (
    <span className={`chip cat-chip${tone}`}>
      <span className="cat-chip-label">{atual ? atual.name : emptyLabel}</span>
      <span aria-hidden="true">⌄</span>
      <select
        className="cat-chip-select"
        aria-label={ariaLabel}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        {(allowEmpty || value === null) && <option value="">{emptyLabel}</option>}
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </span>
  );
}
```

- [ ] **Step 2.2: CSS**

Ao final de `frontend/src/styles/components.css`:

```css
/* Chip de categoria: o <select> cobre o chip inteiro, invisível. */
.cat-chip {
  position: relative;
  max-width: 100%;
  cursor: pointer;
  transition: border-color 150ms ease;
}

.cat-chip:hover {
  border-color: var(--border-strong);
}

.cat-chip-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-chip-select {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  border: 0;
  padding: 0;
  cursor: pointer;
}

/* O foco tem de aparecer no chip, já que o controle real é invisível. */
.cat-chip:focus-within {
  border-color: var(--focus);
}
```

- [ ] **Step 2.3: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: limpo. (Componente ainda não usado — entra na Task 4.)

- [ ] **Step 2.4: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/CategoryChip.tsx frontend/src/styles/components.css
git commit -m "feat(ui): category chip with native select overlay"
```

---

### Task 3: Barra de filtros e strip de totais

**Files:**
- Create: `frontend/src/components/transactions/FilterBar.tsx`
- Create: `frontend/src/components/transactions/TotalsStrip.tsx`
- Modify: `frontend/src/styles/pages.css`

Só os componentes e o CSS. A página é reescrita de uma vez na Task 4 — fatiar a
reescrita em dois commits deixaria a tela sem tabela no meio do caminho.

- [ ] **Step 3.1: `TotalsStrip`**

Create `frontend/src/components/transactions/TotalsStrip.tsx`:

```tsx
import type { TxSummary } from "../../lib/txTable";
import Money from "../Money";

export default function TotalsStrip({ s }: { s: TxSummary }) {
  return (
    <section className="tx-totals">
      <div>
        <span className="label">Entradas</span>
        <Money cents={s.entradas} tone="accent" />
      </div>
      <div>
        <span className="label">Saídas</span>
        <Money cents={-s.saidas} />
      </div>
      <div>
        <span className="label">Saldo</span>
        <Money cents={s.saldo} tone={s.saldo < 0 ? "over" : "accent"} />
      </div>
    </section>
  );
}
```

- [ ] **Step 3.2: `FilterBar`**

Create `frontend/src/components/transactions/FilterBar.tsx`:

```tsx
import type { Account, Tx } from "../../api/types";
import { accountCounts, statusCounts, type TxStatus } from "../../lib/txTable";
import CategoryChip from "../CategoryChip";
import Chip from "../Chip";

export default function FilterBar({
  txs,
  accounts,
  accountId,
  onAccount,
  categoryId,
  onCategory,
  status,
  onStatus,
  text,
  onText,
  onSearch,
  showIgnored,
  onShowIgnored,
  total,
}: {
  txs: Tx[];
  accounts: Account[];
  accountId: number | null;
  onAccount: (id: number | null) => void;
  categoryId: number | null;
  onCategory: (id: number | null) => void;
  status: TxStatus;
  onStatus: (s: TxStatus) => void;
  text: string;
  onText: (t: string) => void;
  onSearch: () => void;
  showIgnored: boolean;
  onShowIgnored: (v: boolean) => void;
  total: number;
}) {
  const porConta = accountCounts(txs);
  const estados = statusCounts(txs);
  const toggle = (s: TxStatus) => onStatus(status === s ? "todas" : s);

  return (
    <section className="tx-filters">
      <div className="tx-search">
        <span className="tx-search-icon" aria-hidden="true" />
        <input
          placeholder="Buscar descrição…"
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          aria-label="Buscar descrição"
        />
      </div>

      <div className="tx-chip-row">
        <Chip active={accountId === null} onClick={() => onAccount(null)}>
          Todas as contas
        </Chip>
        {accounts.map((a) => (
          <Chip
            key={a.id}
            active={accountId === a.id}
            onClick={() => onAccount(accountId === a.id ? null : a.id)}
          >
            {a.name} <span className="tone-muted mono">{porConta.get(a.id) ?? 0}</span>
          </Chip>
        ))}
      </div>

      <div className="tx-chip-row tx-chip-row--split">
        <Chip tone="warn" active={status === "llm"} onClick={() => toggle("llm")}>
          A classificar <span className="mono">{estados.llm}</span>
        </Chip>
        <Chip active={status === "sem-categoria"} onClick={() => toggle("sem-categoria")}>
          Sem categoria <span className="mono">{estados.semCategoria}</span>
        </Chip>
        <CategoryChip
          value={categoryId}
          onChange={onCategory}
          allowEmpty
          emptyLabel="Todas as categorias"
          ariaLabel="Filtrar por categoria"
        />
        <label className="tx-ignored">
          <input
            type="checkbox"
            checked={showIgnored}
            onChange={(e) => onShowIgnored(e.target.checked)}
          />
          mostrar ignoradas
        </label>
      </div>

      <div className="tx-count mono">
        {total} {total === 1 ? "lançamento" : "lançamentos"}
      </div>
    </section>
  );
}
```

- [ ] **Step 3.3: CSS**

Ao final de `frontend/src/styles/pages.css`:

```css
/* ---------- Transações ---------- */
.tx-filters {
  display: grid;
  grid-template-columns: 1.1fr auto auto auto;
  align-items: center;
  gap: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 12px 16px;
  margin-bottom: 12px;
}

.tx-search {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-control);
  padding: 7px 11px;
}

.tx-search:focus-within {
  border-color: var(--focus);
}

.tx-search-icon {
  width: 11px;
  height: 11px;
  border: 1.5px solid var(--muted);
  border-radius: var(--r-pill);
  flex: none;
}

.tx-search input {
  flex: 1;
  min-width: 0;
  background: none;
  border: 0;
  padding: 0;
  font-size: 13px;
}

.tx-search input:focus {
  outline: none;
}

.tx-chip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tx-chip-row--split {
  border-left: 1px solid var(--border);
  padding-left: 18px;
}

/* "A classificar" é amarelo sempre, não só quando ativo. Precisa de mais
   especificidade que `.chip.is-active`, que senão pinta o texto de --ink. */
.tx-chip-row .chip.tone-warn {
  color: var(--warn);
  background: var(--tint-warn);
}

.tx-chip-row .chip.is-active {
  border-color: var(--border-strong);
}

.tx-chip-row .chip.is-active.tone-warn {
  border-color: var(--warn);
}

.tx-ignored {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--ink-2);
  cursor: pointer;
  padding: 6px 4px;
}

.tx-count {
  justify-self: end;
  font-size: 12px;
  color: var(--muted);
}

.tx-totals {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  overflow: hidden;
  margin-bottom: 12px;
}

.tx-totals > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 16px;
  border-right: 1px solid var(--border);
}

.tx-totals > div:last-child {
  border-right: 0;
}

.tx-totals .money {
  font-size: 15px;
}
```

- [ ] **Step 3.4: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: limpo. (Os dois componentes ainda não são usados — entram na Task 4.)

- [ ] **Step 3.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/transactions frontend/src/styles/pages.css
git commit -m "feat(ui): transactions filter bar and totals strip"
```

---

### Task 4: Tabela redesenhada e reescrita da página

**Files:**
- Create: `frontend/src/components/transactions/TxTable.tsx`
- Modify: `frontend/src/pages/Transactions.tsx`, `frontend/src/styles/pages.css`

- [ ] **Step 4.1: Criar a tabela**

Create `frontend/src/components/transactions/TxTable.tsx`:

```tsx
import type { Tx } from "../../api/types";
import { dayMonth } from "../../lib/months";
import { formatSigned } from "../../lib/money";
import type { SortDir, SortKey } from "../../lib/txTable";
import CategoryChip from "../CategoryChip";

const SOURCE_LABEL: Record<string, string> = {
  regra: "regra",
  llm: "llm",
  manual: "manual",
};

const COLUNAS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: "date", label: "Data" },
  { key: "description", label: "Descrição" },
  { key: "account", label: "Conta" },
  { key: "amount_cents", label: "Valor", num: true },
  { key: "category", label: "Categoria" },
  { key: "source", label: "Origem" },
];

export default function TxTable({
  rows,
  accountName,
  selected,
  onToggle,
  onToggleAll,
  onCategory,
  onIgnore,
  sort,
  onSort,
}: {
  rows: Tx[];
  accountName: Map<number, string>;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  onCategory: (tx: Tx, categoryId: number | null) => void;
  onIgnore: (tx: Tx) => void;
  sort: { key: SortKey; dir: SortDir } | null;
  onSort: (k: SortKey) => void;
}) {
  const todasMarcadas = rows.length > 0 && rows.every((t) => selected.has(t.id));

  return (
    <div className="card tx-card">
      <table className="tx-table">
        <thead>
          <tr>
            <th className="tx-col-check">
              <input
                type="checkbox"
                checked={todasMarcadas}
                onChange={onToggleAll}
                aria-label="Selecionar todas as linhas visíveis"
              />
            </th>
            {COLUNAS.map((c) => {
              const ativa = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  className={c.num ? "num tx-th" : "tx-th"}
                  onClick={() => onSort(c.key)}
                  aria-sort={
                    ativa && sort
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {c.label}
                  {ativa && sort ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              );
            })}
            <th className="tx-col-ignore"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={t.id}
              className={`${selected.has(t.id) ? "is-selected" : ""}${t.ignored ? " is-ignored" : ""}`}
            >
              <td className="tx-col-check">
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => onToggle(t.id)}
                  aria-label={`Selecionar ${t.description}`}
                />
              </td>
              <td className="mono tone-muted tx-col-date">{dayMonth(t.date)}</td>
              <td className="tx-col-desc">
                <span className="tx-desc">{t.description}</span>
                {t.installment && <span className="tx-parcela mono">{t.installment}</span>}
              </td>
              <td className="tone-muted tx-col-account">
                {accountName.get(t.account_id) ?? t.account_id}
              </td>
              <td className="num mono">{formatSigned(t.amount_cents)}</td>
              <td>
                <CategoryChip
                  value={t.category_id}
                  onChange={(id) => onCategory(t, id)}
                  ariaLabel={`Categoria de ${t.description}`}
                />
              </td>
              <td className="tone-muted tx-col-source">
                {t.source ? SOURCE_LABEL[t.source] : "—"}
              </td>
              <td className="tx-col-ignore">
                <button
                  className="ghost tx-ignore"
                  title={
                    t.ignored
                      ? "Voltar a contar (remove a regra de ignorar)"
                      : "Ignorar (cria regra: futuras com esta descrição também)"
                  }
                  onClick={() => onIgnore(t)}
                >
                  {t.ignored ? "↩" : "⊘"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tx-foot">
        <span>
          {rows.length} {rows.length === 1 ? "lançamento" : "lançamentos"}
        </span>
        <span>Ignoradas não entram no fluxo e ficam ocultas por padrão.</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.2: CSS**

Ao final da seção "Transações" de `frontend/src/styles/pages.css`:

```css
.tx-card {
  padding: 6px 8px 10px;
}

.tx-table {
  table-layout: fixed;
  font-size: 13px;
}

.tx-table th {
  border-bottom: 0;
  padding: 9px 12px 8px;
}

.tx-th {
  cursor: pointer;
  user-select: none;
}

.tx-th:hover {
  color: var(--ink-2);
}

.tx-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--divider);
}

.tx-table tbody tr:hover td {
  background: var(--hover-row);
}

.tx-table tbody tr.is-selected td {
  background: var(--row-selected);
}

.tx-table tbody tr.is-ignored td {
  opacity: 0.5;
}

.tx-table td:first-child {
  border-radius: var(--r-control) 0 0 var(--r-control);
}

.tx-table td:last-child {
  border-radius: 0 var(--r-control) var(--r-control) 0;
}

.tx-col-check {
  width: 26px;
  text-align: center;
}

.tx-col-date {
  width: 62px;
}

.tx-col-account {
  width: 132px;
  font-size: 11.5px;
}

.tx-col-source {
  width: 84px;
  font-size: 11px;
}

.tx-col-ignore {
  width: 30px;
  text-align: center;
}

.tx-col-desc {
  min-width: 0;
}

.tx-desc {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

/* Parcelamento: badge quadrado em mono, ao lado do nome. */
.tx-parcela {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--r-badge);
  background: var(--hover-ghost);
  color: var(--ink-2);
  margin-left: 8px;
  white-space: nowrap;
}

.tx-ignore {
  padding: 2px 6px;
  color: var(--muted);
  font-size: 13px;
}

.tx-ignore:hover {
  color: var(--over);
  background: none;
}

.tx-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 12px 4px;
  border-top: 1px solid var(--border);
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--muted);
}
```

E o token da linha selecionada, em `frontend/src/styles/tokens.css` — no bloco `:root`:

```css
  --row-selected: rgba(19, 117, 116, 0.1);
```

e no bloco `:root[data-theme="dark"]`:

```css
  --row-selected: rgba(79, 208, 207, 0.08);
```

- [ ] **Step 4.3: Reescrever a página**

Substituir todo o conteúdo de `frontend/src/pages/Transactions.tsx` por:

```tsx
import { useMemo, useState } from "react";

import { useAccounts, useCategories, usePatchTx, useTransactions } from "../api/hooks";
import MonthPicker from "../components/MonthPicker";
import PageHeader from "../components/PageHeader";
import FilterBar from "../components/transactions/FilterBar";
import TotalsStrip from "../components/transactions/TotalsStrip";
import TxTable from "../components/transactions/TxTable";
import { currentMonth, monthTitle } from "../lib/months";
import {
  filterTxs,
  sortTxs,
  summarize,
  type SortDir,
  type SortKey,
  type TxStatus,
} from "../lib/txTable";

export default function Transactions() {
  const [month, setMonth] = useState(currentMonth());
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [status, setStatus] = useState<TxStatus>("todas");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [showIgnored, setShowIgnored] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const patchTx = usePatchTx();
  // Conta, categoria e estado são filtrados no cliente: os chips precisam da
  // contagem de cada opção, e para isso é preciso ter o mês inteiro em mãos.
  const {
    data: txs,
    isLoading,
    error,
  } = useTransactions({ month, q: query || undefined, include_ignored: showIgnored });

  const lookups = useMemo(
    () => ({
      accountName: new Map((accounts ?? []).map((a) => [a.id, a.name])),
      categoryName: new Map((categories ?? []).map((c) => [c.id, c.name])),
    }),
    [accounts, categories]
  );

  const visiveis = useMemo(
    () => filterTxs(txs ?? [], { accountId, categoryId, status }),
    [txs, accountId, categoryId, status]
  );
  const rows = useMemo(
    () => (sort ? sortTxs(visiveis, sort.key, sort.dir, lookups) : visiveis),
    [visiveis, sort, lookups]
  );
  const totais = useMemo(() => summarize(visiveis), [visiveis]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }

  function toggleSelected(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) =>
      rows.length > 0 && rows.every((t) => s.has(t.id))
        ? new Set()
        : new Set(rows.map((t) => t.id))
    );
  }

  return (
    <>
      <PageHeader eyebrow="Transações" title={monthTitle(month)}>
        <MonthPicker month={month} onChange={setMonth} />
      </PageHeader>

      <FilterBar
        txs={txs ?? []}
        accounts={accounts ?? []}
        accountId={accountId}
        onAccount={setAccountId}
        categoryId={categoryId}
        onCategory={setCategoryId}
        status={status}
        onStatus={setStatus}
        text={text}
        onText={setText}
        onSearch={() => setQuery(text)}
        showIgnored={showIgnored}
        onShowIgnored={setShowIgnored}
        total={visiveis.length}
      />

      <TotalsStrip s={totais} />

      {isLoading && <p className="muted">Carregando…</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      {!isLoading && !error && rows.length === 0 && (
        <div className="card muted">Nenhuma transação no filtro.</div>
      )}
      {rows.length > 0 && (
        <TxTable
          rows={rows}
          accountName={lookups.accountName}
          selected={selected}
          onToggle={toggleSelected}
          onToggleAll={toggleAll}
          onCategory={(t, id) =>
            id !== null && patchTx.mutate({ id: t.id, patch: { category_id: id } })
          }
          onIgnore={(t) => patchTx.mutate({ id: t.id, patch: { ignored: !t.ignored } })}
          sort={sort}
          onSort={toggleSort}
        />
      )}
    </>
  );
}
```

O `CategorySelect` continua existindo para a tela de Configurações; só deixa de ser usado
aqui.

- [ ] **Step 4.4: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: tudo verde, contagem de testes igual à da Task 1.

- [ ] **Step 4.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/transactions frontend/src/pages/Transactions.tsx frontend/src/styles
git commit -m "feat(ui): redesigned transactions table with row selection"
```

---

### Task 5: Barra flutuante de ações em lote

**Files:**
- Create: `frontend/src/components/transactions/SelectionBar.tsx`
- Modify: `frontend/src/pages/Transactions.tsx`, `frontend/src/styles/pages.css`

- [ ] **Step 5.1: Criar a barra**

Create `frontend/src/components/transactions/SelectionBar.tsx`:

```tsx
import CategoryChip from "../CategoryChip";

export default function SelectionBar({
  count,
  busy,
  onCategorizar,
  onIgnorar,
  onLimpar,
}: {
  count: number;
  busy: boolean;
  onCategorizar: (categoryId: number) => void;
  onIgnorar: () => void;
  onLimpar: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="tx-selbar" role="region" aria-label="Ações da seleção">
      <span className="tx-selbar-count">
        {count} {count === 1 ? "transação selecionada" : "transações selecionadas"}
      </span>
      <span className="tx-selbar-sep" />
      <span className="tx-selbar-cat">
        <CategoryChip
          value={null}
          onChange={(id) => id !== null && onCategorizar(id)}
          emptyLabel={busy ? "Categorizando…" : "Categorizar"}
          ariaLabel="Categorizar as transações selecionadas"
        />
      </span>
      <button className="ghost tx-selbar-ignore" onClick={onIgnorar} disabled={busy}>
        Ignorar
      </button>
      <button className="ghost" onClick={onLimpar} disabled={busy}>
        limpar
      </button>
    </div>
  );
}
```

- [ ] **Step 5.2: CSS**

Ao final da seção "Transações" de `frontend/src/styles/pages.css`:

```css
/* Única sombra do sistema: a barra flutuante. */
.tx-selbar {
  position: fixed;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--float-bg);
  border: 1px solid var(--float-border);
  border-radius: 11px;
  padding: 10px 14px;
  box-shadow: var(--shadow-float);
  z-index: 20;
}

.tx-selbar-count {
  font-size: 12.5px;
  font-weight: 500;
}

.tx-selbar-sep {
  width: 1px;
  height: 18px;
  background: var(--border-strong);
}

/* O chip da barra é a ação primária: teal, não o cinza padrão do chip. */
.tx-selbar-cat .chip {
  background: var(--nav-active);
  border-color: var(--focus);
  color: var(--accent);
  font-size: 12.5px;
  padding: 6px 12px;
}

.tx-selbar-ignore:hover {
  color: var(--over);
}
```

- [ ] **Step 5.3: Religar a página**

Em `frontend/src/pages/Transactions.tsx`:

1. Importar `import SelectionBar from "../components/transactions/SelectionBar";`.
2. Acrescentar o estado de ocupado, junto dos outros `useState`:

```tsx
  const [busy, setBusy] = useState(false);
```

3. Acrescentar as ações em lote, junto dos outros manipuladores:

```tsx
  // Não existe PATCH em lote na API: N requisições sequenciais, e a invalidação
  // global do react-query refaz a lista uma vez ao final.
  async function aplicarEmLote(patch: { category_id?: number; ignored?: boolean }) {
    setBusy(true);
    try {
      for (const id of selected) {
        await patchTx.mutateAsync({ id, patch });
      }
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }
```

4. Antes do fechamento do fragmento (`</>`), acrescentar:

```tsx
      <SelectionBar
        count={selected.size}
        busy={busy}
        onCategorizar={(categoryId) => aplicarEmLote({ category_id: categoryId })}
        onIgnorar={() => aplicarEmLote({ ignored: true })}
        onLimpar={() => setSelected(new Set())}
      />
```

- [ ] **Step 5.4: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: tudo verde.

- [ ] **Step 5.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/transactions frontend/src/pages/Transactions.tsx frontend/src/styles/pages.css
git commit -m "feat(ui): floating bulk action bar for selected transactions"
```

---

### Task 6: Verificação final

- [ ] **Step 6.1: Suítes completas**

Run: `cd frontend && npm test && npx tsc --noEmit && npm run lint && npm run build`
Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: tudo PASS; backend `110 passed` (intocado neste plano).

- [ ] **Step 6.2: Verificação visual (skill webapp-testing)**

Com backend (8000) e vite (5173) rodando — o uvicorn **não** precisa reiniciar. Em
`http://localhost:5173/#/transacoes`:

1. **Header:** eyebrow "Transações", h1 "Agosto 2026", seletor de mês.
2. **Busca:** digitar e apertar Enter filtra; o contador à direita acompanha.
3. **Chips de conta:** mostram a contagem por conta; clicar filtra e clicar de novo
   limpa; "Todas as contas" volta ao conjunto completo.
4. **Chips de estado:** "A classificar N" em amarelo (conta só o mês, ao contrário do
   "revisar N" do Dashboard, que é global); "Sem categoria N"; ambos alternam.
5. **Filtro por categoria** reduz a lista; "Todas as categorias" limpa.
6. **Totais** batem com a lista filtrada (entradas em teal, saldo negativo em vermelho).
7. **Tabela:** clicar num cabeçalho ordena e inverte; o chip de categoria abre a lista
   nativa e trocar a categoria persiste (recarregar e conferir); categoria de
   investimento aparece em lilás; parcelamento como badge mono.
8. **Seleção:** marcar duas linhas pinta as linhas e abre a barra flutuante; "Categorizar"
   aplica nas duas; "Ignorar" some com elas (com "mostrar ignoradas" desmarcado);
   "limpar" fecha a barra. Conferir o checkbox do cabeçalho marcando/desmarcando tudo.
9. Screenshot em dark e em light; console sem erros.

- [ ] **Step 6.3: Revisão de código**

Usar a skill code-review sobre o conjunto de commits deste plano (preferência do usuário:
sem revisor por task, uma revisão ao final).
