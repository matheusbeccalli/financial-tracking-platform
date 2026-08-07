import { useMemo, useState } from "react";

import { useAccounts, useCategories, usePatchTx, useTransactions } from "../api/hooks";
import CategorySelect from "../components/CategorySelect";
import MonthPicker from "../components/MonthPicker";
import { formatBRL } from "../lib/money";
import { currentMonth } from "../lib/months";
import { sortTxs, summarize, type SortDir, type SortKey } from "../lib/txTable";

const SOURCE_LABEL: Record<string, string> = {
  regra: "regra",
  llm: "🤖 llm",
  manual: "manual",
};

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
      aria-sort={
        active && sort ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
      }
    >
      {label}
      {active && sort ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}

export default function Transactions() {
  const [month, setMonth] = useState(currentMonth());
  const [accountId, setAccountId] = useState<number | "">("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [showIgnored, setShowIgnored] = useState(false);

  const { data: accounts } = useAccounts();
  const { data: txs, isLoading, error } = useTransactions({
    month,
    account_id: accountId === "" ? undefined : accountId,
    category_id: categoryId ?? undefined,
    q: query || undefined,
    include_ignored: showIgnored,
  });
  const patchTx = usePatchTx();
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

  const accountName = lookups.accountName;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Transações</h2>
        <MonthPicker month={month} onChange={setMonth} />
      </div>
      <div className="card row">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Todas as contas</option>
          {(accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <CategorySelect value={categoryId} onChange={setCategoryId} allowEmpty />
        <input
          placeholder="Buscar descrição…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setQuery(text)}
        />
        <button onClick={() => setQuery(text)}>Filtrar</button>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={showIgnored}
            onChange={(e) => setShowIgnored(e.target.checked)}
          />
          mostrar ignoradas
        </label>
      </div>
      <div className="card">
        {isLoading && <p className="muted">Carregando…</p>}
        {error && <p className="error">{(error as Error).message}</p>}
        {txs && txs.length === 0 && <p className="muted">Nenhuma transação no filtro.</p>}
        {txs && txs.length > 0 && (
          <p className="muted">
            {summary.count} transações · entradas {formatBRL(summary.entradas)} ·
            saídas {formatBRL(-summary.saidas || 0)} ·{" "}
            <span className={summary.saldo > 0 ? "pos" : undefined}>
              saldo {formatBRL(summary.saldo)}
            </span>
            {summary.temIgnoradas && " (ignoradas fora da soma)"}
          </p>
        )}
        {txs && txs.length > 0 && (
          <table>
            <thead>
              <tr>
                <SortableTh label="Data" k="date" sort={sort} onSort={toggleSort} />
                <SortableTh label="Descrição" k="description" sort={sort} onSort={toggleSort} />
                <SortableTh label="Conta" k="account" sort={sort} onSort={toggleSort} />
                <SortableTh
                  label="Valor"
                  k="amount_cents"
                  sort={sort}
                  onSort={toggleSort}
                  className="num"
                />
                <SortableTh label="Categoria" k="category" sort={sort} onSort={toggleSort} />
                <SortableTh label="Origem" k="source" sort={sort} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} style={t.ignored ? { opacity: 0.5 } : undefined}>
                  <td className="muted">{t.date}</td>
                  <td>
                    {t.description}
                    {t.installment && (
                      <span className="badge" style={{ marginLeft: 6 }}>
                        {t.installment}
                      </span>
                    )}
                  </td>
                  <td className="muted">{accountName.get(t.account_id) ?? t.account_id}</td>
                  <td className={`num${t.amount_cents > 0 ? " pos" : ""}`}>
                    {formatBRL(t.amount_cents)}
                  </td>
                  <td>
                    <CategorySelect
                      value={t.category_id}
                      onChange={(id) =>
                        id !== null &&
                        patchTx.mutate({ id: t.id, patch: { category_id: id } })
                      }
                    />
                  </td>
                  <td>
                    {t.source ? (
                      <span className="badge">{SOURCE_LABEL[t.source]}</span>
                    ) : (
                      <span className="badge" style={{ color: "var(--critical)" }}>
                        a classificar
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      title={
                        t.ignored
                          ? "Voltar a contar (remove a regra de ignorar)"
                          : "Ignorar (cria regra: futuras com esta descrição também)"
                      }
                      onClick={() =>
                        patchTx.mutate({ id: t.id, patch: { ignored: !t.ignored } })
                      }
                    >
                      {t.ignored ? "↩" : "🚫"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
