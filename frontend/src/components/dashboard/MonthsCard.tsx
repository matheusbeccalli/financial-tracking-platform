import { useSummaries } from "../../api/hooks";
import type { Dias } from "../../api/types";
import { monthsBars } from "../../lib/dashboard";
import { formatK } from "../../lib/money";
import { lastNMonths, monthLabel } from "../../lib/months";

const N_MONTHS = 6;

export default function MonthsCard({ month, dias }: { month: string; dias: Dias }) {
  const months = lastNMonths(month, N_MONTHS);
  const results = useSummaries(months);
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
      <div className="months-chart">
        <div className="months-media" style={{ bottom: `${mediaPct}%` }} />
        {v.bars.map((b) => (
          <div key={b.month} className="months-col">
            <span className={`mono months-col-value${b.atual ? " is-current" : ""}`}>
              {formatK(b.cents)}
            </span>
            <div
              className={`months-col-bar${b.atual ? " is-current" : ""}`}
              style={{ height: `${b.heightPct}%` }}
            />
            <span className={`months-col-label${b.atual ? " is-current" : ""}`}>
              {monthLabel(b.month).slice(0, 3)}
            </span>
          </div>
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
