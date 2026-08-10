import { useState } from "react";

import { useBridge } from "../../api/hooks";
import { formatBRL } from "../../lib/money";
import { buildWaterfall, waterfallLayout, waterfallZeroPct } from "../../lib/waterfall";
import Segmented from "../Segmented";

type Period = "month" | "ytd" | "12m";

const PERIODS = [
  { value: "month" as const, label: "Mês" },
  { value: "ytd" as const, label: "YTD" },
  { value: "12m" as const, label: "12 meses" },
];

export default function BridgeCard({ refMonth }: { refMonth: string }) {
  const [period, setPeriod] = useState<Period>("month");
  const { data, error } = useBridge(period, refMonth);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Do orçado ao realizado</h2>
          {data && (
            <div className="sub">
              o que explica a diferença de {formatBRL(Math.abs(data.end - data.start))}
            </div>
          )}
        </div>
        <Segmented
          value={period}
          options={PERIODS}
          onChange={setPeriod}
          ariaLabel="Período do bridge"
        />
      </div>

      {error && <p className="error">Erro ao carregar bridge: {(error as Error).message}</p>}
      {!data && !error && <p className="muted">Carregando…</p>}

      {data && <Waterfall bridge={buildWaterfall(data)} />}

      <div className="bridge-legend">
        <span>
          <span className="swatch tone-accent" />
          desvio favorável
        </span>
        <span>
          <span className="swatch tone-over" />
          desfavorável
        </span>
        <span>
          <span className="swatch tone-muted" />
          totais orçado / realizado
        </span>
      </div>
    </div>
  );
}

function Waterfall({ bridge }: { bridge: ReturnType<typeof buildWaterfall> }) {
  const bars = waterfallLayout(bridge);
  const zeroPct = waterfallZeroPct(bridge);
  const cols = { gridTemplateColumns: `repeat(${bars.length}, 1fr)` };
  return (
    <>
      <div className="bridge-plot" style={cols}>
        <div className="bridge-grid" aria-hidden="true">
          <span style={{ top: "0%" }} />
          <span style={{ top: "25%" }} />
          <span style={{ top: "50%" }} />
          <span style={{ top: "75%" }} />
        </div>
        {/* Com realizado negativo o piso do gráfico deixa de ser o zero; sem esta
            linha não dá para ler as barras contra o eixo. */}
        {zeroPct !== null && (
          <div className="bridge-zero" style={{ top: `${zeroPct}%` }} aria-hidden="true" />
        )}
        {bars.map((b, i) => (
          <div key={`${b.label}-${i}`} className="bridge-col">
            <span
              className={`bridge-bar bridge-bar--${b.kind}`}
              style={{ top: `${b.topPct}%`, height: `${b.heightPct}%` }}
              title={`${b.label}: ${formatBRL(b.signed)}`}
            />
          </div>
        ))}
      </div>
      <div className="bridge-labels" style={cols}>
        {bars.map((b, i) => (
          <div key={`${b.label}-${i}`} className={b.kind === "total" ? "is-total" : undefined}>
            {b.label}
          </div>
        ))}
      </div>
    </>
  );
}
