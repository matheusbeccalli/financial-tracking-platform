import { useState } from "react";

import type { Summary } from "../../api/types";
import { burningRows } from "../../lib/dashboard";
import { formatBRL } from "../../lib/money";
import Money from "../Money";
import Pill from "../Pill";
import ProgressBar from "../ProgressBar";
import Segmented from "../Segmented";
import InvestBlock from "./InvestBlock";

type Sort = "risco" | "valor";

const SORT_OPTIONS = [
  { value: "risco" as const, label: "Risco" },
  { value: "valor" as const, label: "Valor" },
];

/** Denominador da linha: "/ 1.500" — sem "R$", como no design. */
const semMoeda = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export default function BurningCard({ s, month }: { s: Summary; month: string }) {
  const [sort, setSort] = useState<Sort>("risco");
  const [expanded, setExpanded] = useState(false);
  const v = burningRows(s.categorias, s.dias, sort);
  const pacePct = Math.round(
    (s.dias.no_mes > 0 ? s.dias.decorridos / s.dias.no_mes : 0) * 100
  );

  return (
    <div className="card burning-card">
      <div className="card-head">
        <div>
          <h2>Onde o dinheiro está queimando</h2>
          <div className="sub">
            {v.comMovimento} categorias com movimento · {v.zeradas} zeradas
          </div>
        </div>
        <Segmented
          value={sort}
          options={SORT_OPTIONS}
          onChange={setSort}
          ariaLabel="Ordenar categorias"
        />
      </div>

      <div className="burning-legend">
        <span className="burning-legend-tick" />
        <span>marca = ritmo esperado do mês ({pacePct}%)</span>
      </div>

      <div className="burning-rows">
        {v.rows.length === 0 && <p className="muted">Sem saídas neste mês.</p>}
        {v.rows.map((r) => (
          <div key={r.id} className="burning-row">
            <div>
              <div className="burning-row-name">
                <span>{r.nome}</span>
                {r.chip && <Pill tone={r.chip.tone}>{r.chip.label}</Pill>}
              </div>
              <div className="burning-row-bar">
                {r.semOrcamento ? (
                  <div className="bar tone-over" style={{ height: 5 }}>
                    <span className="bar-hatch" />
                  </div>
                ) : (
                  <ProgressBar
                    pct={r.pct}
                    pace={r.pacePct}
                    tone={r.tone}
                    height={5}
                    ariaLabel={`${r.nome}: ${Math.round(r.pct)}% do orçado`}
                  />
                )}
              </div>
            </div>
            <div className="burning-row-values mono">
              <div>
                {formatBRL(r.real)}
                {!r.semOrcamento && <span className="tone-muted"> / {semMoeda(r.orcado)}</span>}
              </div>
              <div className={`burning-row-pct tone-${r.semOrcamento ? "muted" : r.tone}`}>
                {r.semOrcamento ? "defina um orçado" : `${Math.round(r.pct)}% consumido`}
              </div>
            </div>
          </div>
        ))}
      </div>

      {expanded && v.lowRows.length > 0 && (
        <div className="burning-low">
          <div className="label">Demais categorias</div>
          <div className="burning-low-grid">
            {v.lowRows.map((c) => (
              <div key={c.id} className="burning-low-row">
                <span>
                  {c.nome}
                  {c.kind !== "saida" && (
                    <span
                      className={`burning-low-kind tone-${c.kind === "entrada" ? "accent" : "invest"}`}
                    >
                      {c.kind}
                    </span>
                  )}
                </span>
                <span className="mono tone-ink-2">
                  <Money cents={c.real} zeroDash /> /{" "}
                  {c.orcado > 0 ? semMoeda(c.orcado) : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {v.lowRows.length > 0 && (
        <button className="burning-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded
            ? `Ocultar as outras ${v.lowRows.length} categorias`
            : `Ver todas as ${v.rows.length + v.lowRows.length} categorias`}
        </button>
      )}

      <InvestBlock month={month} meta={s.investimentos.orcado} />
    </div>
  );
}
