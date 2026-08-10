import type { Summary } from "../../api/types";
import { donutSlices } from "../../lib/dashboard";
import { formatBRL } from "../../lib/money";
import { monthLabel } from "../../lib/months";

export default function DonutCard({ s, month }: { s: Summary; month: string }) {
  const { slices, top3Pct } = donutSlices(s.categorias, s.saidas.real);

  if (slices.length === 0)
    return (
      <div className="card">
        <h2>Composição das saídas</h2>
        <div className="sub">sem saídas em {monthLabel(month)}</div>
      </div>
    );

  const gradient = slices
    .map((sl) => `var(--donut-${sl.index + 1}) ${sl.from}% ${sl.to}%`)
    .join(", ");

  return (
    <div className="card">
      <h2>Composição das saídas</h2>
      <div className="sub">
        {formatBRL(s.saidas.real)} em {monthLabel(month)}
      </div>
      <div className="donut-wrap">
        <div className="donut" style={{ background: `conic-gradient(${gradient})` }}>
          <div className="donut-hole">
            <div className="mono donut-hole-value">{top3Pct}%</div>
            <div className="donut-hole-label">
              em {Math.min(3, slices.length)}
              <br />
              categorias
            </div>
          </div>
        </div>
        <div className="donut-legend">
          {slices.map((sl) => (
            <div key={sl.nome} className="donut-legend-row">
              <span
                className="swatch donut-swatch"
                style={{ background: `var(--donut-${sl.index + 1})` }}
              />
              <span className="donut-legend-name">{sl.nome}</span>
              <span className="mono tone-ink-2">{Math.round(sl.pct)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
