import { useState } from "react";

import { useAccounts, usePatchTx, useTransactions } from "../api/hooks";
import CategorySelect from "../components/CategorySelect";
import MonthPicker from "../components/MonthPicker";
import { formatBRL } from "../lib/money";
import { currentMonth } from "../lib/months";

const SOURCE_LABEL: Record<string, string> = {
  regra: "regra",
  llm: "🤖 llm",
  manual: "manual",
};

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
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));

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
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Conta</th>
                <th className="num">Valor</th>
                <th>Categoria</th>
                <th>Origem</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
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
                      title={t.ignored ? "Voltar a contar" : "Ignorar (não conta no fluxo)"}
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
