import { useSummaries } from "../../api/hooks";
import type { Dias } from "../../api/types";
import { monthsBars } from "../../lib/dashboard";
import { formatK } from "../../lib/money";
import { lastNMonths, monthLabel } from "../../lib/months";

const N_MONTHS = 6;

export default function MonthsCard({ month, dias }: { month: string; dias: Dias }) {
  const months = lastNMonths(month, N_MONTHS);
  const results = useSummaries(months);

  const error = results.find((r) => r.error)?.error;
  if (error)
    return (
      <div className="card">
        <h2>Saídas — {N_MONTHS} meses</h2>
        <p className="error">Erro ao carregar o histórico: {(error as Error).message}</p>
      </div>
    );
  if (results.some((r) => !r.data)) return <div className="card muted">Carregando…</div>;

  const v = monthsBars(
    months,
    results.map((r) => r.data!.saidas.real),
    dias
  );
  const mediaPct = v.maior > 0 ? (v.media / v.maior) * 100 : 0;

  return (
    <div className="card">
      <div className="months-head">
        <h2>Saídas — {N_MONTHS} meses</h2>
        <span className="mono sub">média {formatK(v.media)}</span>
      </div>
      {/* A área de plotagem tem altura própria e as barras são posicionadas dentro
          dela: com os rótulos no mesmo fluxo, uma barra de 100% estouraria a altura
          e o flex-shrink achataria o topo da escala. */}
      <div className="months-plot">
        <div className="months-media" style={{ bottom: `${mediaPct}%` }} />
        {v.bars.map((b) => (
          <div key={b.month} className="months-col">
            <span
              className={`mono months-col-value${b.atual ? " is-current" : ""}`}
              style={{ bottom: `${b.heightPct}%` }}
            >
              {formatK(b.cents)}
            </span>
            <div
              className={`months-col-bar${b.atual ? " is-current" : ""}`}
              style={{ height: `${b.heightPct}%` }}
            />
          </div>
        ))}
      </div>
      <div className="months-labels">
        {v.bars.map((b) => (
          <span key={b.month} className={b.atual ? "is-current" : undefined}>
            {monthLabel(b.month).slice(0, 3)}
          </span>
        ))}
      </div>
      {v.projecao !== null && (
        <div className="months-foot">
          Mês em curso — projeção {formatK(v.projecao)} se o ritmo se mantiver.
        </div>
      )}
    </div>
  );
}
