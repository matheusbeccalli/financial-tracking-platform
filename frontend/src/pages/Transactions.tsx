import { useMemo, useState } from "react";

import {
  useAccounts,
  useBatchPatchTx,
  useCategories,
  useDeleteTx,
  useNotDuplicate,
  usePatchTx,
  useTransactions,
} from "../api/hooks";
import MonthPicker from "../components/MonthPicker";
import PageHeader from "../components/PageHeader";
import SelectionBar from "../components/transactions/SelectionBar";
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
  const deleteTx = useDeleteTx();
  const notDuplicate = useNotDuplicate();
  const batchPatch = useBatchPatchTx();
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

  const kindById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c.kind])),
    [categories]
  );

  const visiveis = useMemo(
    () => filterTxs(txs ?? [], { accountId, categoryId, status }),
    [txs, accountId, categoryId, status]
  );
  const rows = useMemo(
    () => (sort ? sortTxs(visiveis, sort.key, sort.dir, lookups) : visiveis),
    [visiveis, sort, lookups]
  );
  const totais = useMemo(() => summarize(visiveis, kindById), [visiveis, kindById]);
  // A seleção guarda ids, e as linhas visíveis mudam com mês, busca e filtros. Agir
  // sobre `selected` cru aplicaria a ação em lançamentos de outro mês, invisíveis na
  // tela. A seleção efetiva é sempre a interseção com o que está à vista.
  const selecionadas = useMemo(
    () => rows.filter((t) => selected.has(t.id)),
    [rows, selected]
  );

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }

  function aplicarEmLote(patch: { category_id?: number; ignored?: boolean }) {
    if (batchPatch.isPending) return;
    batchPatch.mutate(
      { ids: selecionadas.map((t) => t.id), patch },
      { onSettled: () => setSelected(new Set()) }
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
    setSelected(
      rows.length > 0 && selecionadas.length === rows.length
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

      {!isLoading && !error && <TotalsStrip s={totais} />}

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
          onDelete={(t) => {
            if (
              window.confirm(
                `Apagar "${t.description}"? Não tem volta — reimportar o arquivo traz de volta.`
              )
            ) {
              deleteTx.mutate(t.id);
            }
          }}
          onNotDuplicate={(t) => notDuplicate.mutate(t.id)}
          sort={sort}
          onSort={toggleSort}
        />
      )}

      <SelectionBar
        count={selecionadas.length}
        busy={batchPatch.isPending}
        onCategorizar={(categoryId) => aplicarEmLote({ category_id: categoryId })}
        onIgnorar={() => aplicarEmLote({ ignored: true })}
        onLimpar={() => setSelected(new Set())}
      />
    </>
  );
}
