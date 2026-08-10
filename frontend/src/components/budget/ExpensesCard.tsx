import type { BudgetLineRow, BudgetSort, BudgetView } from "../../lib/budget";
import { formatBRL } from "../../lib/money";
import BudgetInput from "../BudgetInput";
import Segmented from "../Segmented";

const SORT_OPTIONS = [
  { value: "valor" as const, label: "Maior valor" },
  { value: "nome" as const, label: "A → Z" },
];

export default function ExpensesCard({
  view,
  sort,
  onSort,
  onSave,
}: {
  view: BudgetView;
  sort: BudgetSort;
  onSort: (s: BudgetSort) => void;
  onSave: (categoryId: number, cents: number) => void;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Saídas</h2>
          <div className="sub">barra = peso da categoria no orçamento de saídas</div>
        </div>
        <Segmented
          value={sort}
          options={SORT_OPTIONS}
          onChange={onSort}
          ariaLabel="Ordenar as saídas"
        />
      </div>

      <div className="budget-grid">
        {view.comOrcamento.map((r) => (
          <Linha key={r.id} r={r} onSave={onSave} />
        ))}
      </div>

      {view.semOrcamento.length > 0 && (
        <div className="budget-sem-orcamento">
          <div className="label">Sem orçamento definido</div>
          <div className="budget-grid">
            {view.semOrcamento.map((r) => (
              <Linha key={r.id} r={r} onSave={onSave} vazia />
            ))}
          </div>
        </div>
      )}

      <div className="budget-total">
        <span>Total das saídas</span>
        <span className="mono">{formatBRL(view.total)}</span>
      </div>
    </div>
  );
}

function Linha({
  r,
  onSave,
  vazia = false,
}: {
  r: BudgetLineRow;
  onSave: (categoryId: number, cents: number) => void;
  vazia?: boolean;
}) {
  const alerta = vazia && r.jaGasto > 0;
  return (
    <div className={vazia ? "budget-row budget-row--vazia" : "budget-row"}>
      <div className="budget-row-main">
        <div className="budget-row-name">
          {r.nome}
          {alerta && (
            <span className="budget-row-gasto tone-warn mono">
              {formatBRL(r.jaGasto)} já gastos
            </span>
          )}
        </div>
        {!vazia && (
          <div className="budget-peso">
            <span
              className={r.destaque ? "budget-peso-fill is-forte" : "budget-peso-fill"}
              style={{ width: `${r.pesoPct}%` }}
            />
          </div>
        )}
      </div>
      <BudgetInput
        cents={r.cents}
        width={108}
        className={
          alerta ? "mono dashed budget-input-alerta" : vazia ? "mono dashed" : "mono"
        }
        ariaLabel={`Orçamento de ${r.nome}`}
        onSave={(cents) => onSave(r.id, cents)}
      />
    </div>
  );
}
