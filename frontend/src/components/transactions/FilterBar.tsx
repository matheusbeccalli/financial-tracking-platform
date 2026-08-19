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
        <Chip
          tone="warn"
          active={status === "duplicadas"}
          onClick={() => toggle("duplicadas")}
        >
          Duplicadas <span className="mono">{estados.duplicadas}</span>
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
