import type { CategoryKind } from "../../api/types";
import { formatUnitsSigned } from "../../lib/money";
import { monthLabel } from "../../lib/months";
import type { TrendsMatrix, TrendsRow, TrendsTotals } from "../../lib/trends";
import BudgetInput from "../BudgetInput";
import Pill from "../Pill";

const SECTIONS: { kind: CategoryKind; label: string; nota?: string }[] = [
  { kind: "entrada", label: "Entradas" },
  {
    kind: "investimento",
    label: "Investimentos",
    nota: "aporte líquido; negativo é resgate, não entra em saídas",
  },
  { kind: "saida", label: "Saídas", nota: "ordenadas por desvio entre orçado e média" },
];

/** Classe das células do bloco de plano: o mês corrente tinge mais forte que os futuros. */
const planCls = (base: string, i: number) =>
  `${base} ${i === 0 ? "trends-col-cur" : "trends-col-fut"}`;

export default function MatrixCard({
  m,
  pastMonths,
  planMonths,
  onSave,
}: {
  m: TrendsMatrix;
  pastMonths: string[];
  planMonths: string[];
  onSave: (categoryId: number, cents: number, month: string) => void;
}) {
  return (
    <section className="card trends-card">
      <div className="trends-scroll">
        <div className={`trends-grid trends-grid--${pastMonths.length}`}>
          <div className="trends-row trends-head">
            <div className="trends-cell-cat">Categoria</div>
            <div />
            {pastMonths.map((mo) => (
              <div key={mo} className="num">
                {monthLabel(mo)}
              </div>
            ))}
            <div className="num">média</div>
            <div className="trends-chip-cell">vs. orçado</div>
            {planMonths.map((mo, i) => (
              <div key={mo} className={planCls("num", i)}>
                {monthLabel(mo)}
              </div>
            ))}
          </div>

          {SECTIONS.map(({ kind, label, nota }) => (
            <Section
              key={kind}
              kind={kind}
              label={label}
              nota={nota}
              rows={m.rows[kind]}
              totals={m.totals[kind]}
              planMonths={planMonths}
              onSave={onSave}
            />
          ))}

          <div className="trends-row trends-total">
            <div className="trends-cell-cat">Saldo do mês</div>
            <div />
            {m.saldoPast.map((v, i) => (
              <ToneCell key={i} v={v} />
            ))}
            <ToneCell v={m.saldoMedia} media />
            <div />
            {m.saldoPlan.map((v, i) => (
              <ToneCell key={i} v={v} plan={i} />
            ))}
          </div>

          <div className="trends-row trends-total">
            <div className="trends-cell-cat">Acumulado</div>
            <div />
            {pastMonths.map((mo) => (
              <div key={mo} className="num">
                <span className="trends-zero">—</span>
              </div>
            ))}
            <div className="num">
              <span className="trends-zero">—</span>
            </div>
            <div />
            {m.acumulado.map((v, i) => (
              <ToneCell key={i} v={v} plan={i} />
            ))}
          </div>
        </div>
      </div>

      <div className="trends-legend">
        <span>média = média da janela; mês sem movimento conta como zero</span>
        <span>
          <span className="nd">n/d</span> = sem nenhum lançamento na janela; fora da média e
          do comparativo
        </span>
        <span>
          <span className="trends-legend-swatch" />
          colunas tingidas = orçamento editável; o valor salvo vale a partir daquele mês
        </span>
      </div>
    </section>
  );
}

function Section({
  kind,
  label,
  nota,
  rows,
  totals,
  planMonths,
  onSave,
}: {
  kind: CategoryKind;
  label: string;
  nota?: string;
  rows: TrendsRow[];
  totals: TrendsTotals;
  planMonths: string[];
  onSave: (categoryId: number, cents: number, month: string) => void;
}) {
  return (
    <>
      <div className="trends-section-head">
        <span className={`trends-dot trends-dot--${kind}`} />
        <span className="trends-section-label">{label}</span>
        {nota && <span className="trends-section-nota">— {nota}</span>}
      </div>
      {rows.map((r) => (
        <Row key={r.id} r={r} planMonths={planMonths} onSave={onSave} />
      ))}
      <div className="trends-row trends-total">
        <div className="trends-cell-cat">Total {label.toLowerCase()}</div>
        <div />
        {totals.past.map((v, i) => (
          <Cell key={i} v={v} />
        ))}
        <div className="num trends-media">{formatUnitsSigned(totals.media)}</div>
        <div className="trends-chip-cell">
          {totals.chip && <Pill tone={totals.chip.tone}>{totals.chip.label}</Pill>}
        </div>
        {totals.plan.map((v, i) => (
          <div key={planMonths[i]} className={planCls("num", i)}>
            {formatUnitsSigned(v)}
          </div>
        ))}
      </div>
    </>
  );
}

const BAR_MAX = 16;

function Row({
  r,
  planMonths,
  onSave,
}: {
  r: TrendsRow;
  planMonths: string[];
  onSave: (categoryId: number, cents: number, month: string) => void;
}) {
  const max = Math.max(...r.past.map(Math.abs), 1);
  return (
    <div className="trends-row">
      <div className="trends-cell-cat" title={r.nome}>
        {r.nome}
      </div>
      <span className={`trends-spark trends-spark--${r.kind}`} aria-hidden="true">
        {r.past.map((v, i) => (
          <i
            key={i}
            className={v ? undefined : "is-zero"}
            style={{ height: `${Math.max(2, Math.round((Math.abs(v) / max) * BAR_MAX))}px` }}
          />
        ))}
      </span>
      {r.past.map((v, i) => (
        <Cell key={i} v={v} nd={r.semHist} />
      ))}
      <div className="num trends-media">
        {r.semHist ? <span className="nd">n/d</span> : formatUnitsSigned(r.media)}
      </div>
      <div className="trends-chip-cell">
        {r.chip && <Pill tone={r.chip.tone}>{r.chip.label}</Pill>}
      </div>
      {r.plan.map((v, i) => (
        <div key={planMonths[i]} className={planCls("trends-input", i)}>
          <BudgetInput
            cents={v}
            width="100%"
            className={r.kind === "investimento" ? "mono invest" : "mono"}
            ariaLabel={`Orçamento de ${r.nome} em ${monthLabel(planMonths[i])}`}
            onSave={(cents) => onSave(r.id, cents, planMonths[i])}
          />
        </div>
      ))}
    </div>
  );
}

function Cell({ v, nd = false }: { v: number; nd?: boolean }) {
  if (nd)
    return (
      <div className="num">
        <span className="nd">n/d</span>
      </div>
    );
  if (v === 0)
    return (
      <div className="num">
        <span className="trends-zero">—</span>
      </div>
    );
  return (
    <div className="num">
      {v < 0 ? <span className="tone-over">{formatUnitsSigned(v)}</span> : formatUnitsSigned(v)}
    </div>
  );
}

/** Saldo/acumulado: teal/vermelho pelo sinal; `plan` marca a coluna tingida. */
function ToneCell({ v, plan, media = false }: { v: number; plan?: number; media?: boolean }) {
  const base = media ? "num trends-media" : "num";
  const cls = plan === undefined ? base : planCls(base, plan);
  return (
    <div className={cls}>
      <span className={v < 0 ? "tone-over" : "tone-accent"}>{formatUnitsSigned(v)}</span>
    </div>
  );
}
