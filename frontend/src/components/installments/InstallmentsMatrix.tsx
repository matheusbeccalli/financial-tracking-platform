import { Fragment } from "react";

import type { InstallmentCatRow, InstallmentStatus, InstallmentsProjection } from "../../api/types";
import { formatUnits } from "../../lib/money";
import { monthLabel } from "../../lib/months";

const STATUS_CLS: Record<InstallmentStatus, string | undefined> = {
  ok: undefined,
  risco: "tone-warn",
  estouro: "tone-over",
};

export default function InstallmentsMatrix({ p }: { p: InstallmentsProjection }) {
  const cols = {
    gridTemplateColumns: `220px repeat(${p.months.length}, minmax(84px, 1fr))`,
  };
  return (
    <section className="card inst-card">
      <div className="inst-scroll">
        <div className="inst-grid" style={cols}>
          <div className="inst-head inst-cell-cat">Categoria</div>
          {p.months.map((m) => (
            <div key={m} className="num inst-head">
              {monthLabel(m)}
            </div>
          ))}

          {p.categorias.map((c) => (
            <Fragment key={c.id ?? "sem"}>
              <div className="inst-cell-cat" title={c.nome}>
                {c.nome}
              </div>
              {c.parcelas.map((v, i) => (
                <Cell key={p.months[i]} row={c} i={i} v={v} />
              ))}
            </Fragment>
          ))}

          <div className="inst-cell-cat inst-total">Total</div>
          {p.totais.map((v, i) => (
            <div key={p.months[i]} className="num inst-total">
              {formatUnits(v)}
            </div>
          ))}
        </div>
      </div>
      <div className="inst-legend">
        <span>
          <span className="tone-warn">risco</span> = parcelas tomam ≥ 80% do orçamento do mês ·{" "}
          <span className="tone-over">estouro</span> = parcelas acima do orçamento
        </span>
        <span>valores em unidades, sem centavos; orçamento mostrado na célula alertada</span>
      </div>
    </section>
  );
}

function Cell({ row, i, v }: { row: InstallmentCatRow; i: number; v: number }) {
  if (v === 0)
    return (
      <div className="num">
        <span className="inst-zero">—</span>
      </div>
    );
  const status = row.status[i];
  const cls = STATUS_CLS[status];
  const orcado = row.orcado[i];
  return (
    <div className="num">
      {cls ? <span className={cls}>{formatUnits(v)}</span> : formatUnits(v)}
      {cls && orcado !== null && (
        <span className="inst-orc">/ orç. {formatUnits(orcado)}</span>
      )}
    </div>
  );
}
