import type { Tx } from "../../api/types";
import { dayMonth } from "../../lib/months";
import { formatSigned } from "../../lib/money";
import { describeTwin, type SortDir, type SortKey } from "../../lib/txTable";
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
  onDelete,
  onNotDuplicate,
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
  onDelete: (tx: Tx) => void;
  onNotDuplicate: (tx: Tx) => void;
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
                {t.duplicate_of && (
                  <span className="tx-dup" title={describeTwin(t.duplicate_of)}>
                    possível duplicata
                    <button
                      type="button"
                      className="tx-dup-x"
                      title="Não é duplicata — tirar a marca"
                      onClick={() => onNotDuplicate(t)}
                    >
                      ✕
                    </button>
                  </span>
                )}
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
                <button
                  className="ghost tx-delete"
                  title="Apagar este lançamento (não tem volta)"
                  onClick={() => onDelete(t)}
                >
                  🗑
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
