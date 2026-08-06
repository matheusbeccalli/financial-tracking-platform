import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useBridge } from "../../api/hooks";
import { formatBRL } from "../../lib/money";
import { buildWaterfall, type WaterfallBar } from "../../lib/waterfall";

const PERIODS = [
  ["month", "Mês"],
  ["ytd", "YTD"],
  ["12m", "12 meses"],
] as const;

const BAR_COLORS = { total: "#898781", up: "#2a78d6", down: "#e34948" } as const;

export default function BridgeChart({ refMonth }: { refMonth: string }) {
  const [period, setPeriod] = useState<"month" | "ytd" | "12m">("month");
  const { data: b, error } = useBridge(period, refMonth);
  const bars = b ? buildWaterfall(b) : [];
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Bridge orçado → realizado</h3>
        <div className="row">
          {PERIODS.map(([p, label]) => (
            <button
              key={p}
              className={period === p ? "primary" : ""}
              onClick={() => setPeriod(p)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="error">{(error as Error).message}</p>}
      {b && (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={bars} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <XAxis
              dataKey="label"
              interval={0}
              angle={-30}
              textAnchor="end"
              height={64}
              tick={{ fontSize: 11, fill: "#898781" }}
              axisLine={{ stroke: "#c3c2b7" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => formatBRL(Number(v))}
              width={92}
              tick={{ fontSize: 11, fill: "#898781" }}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine y={0} stroke="#c3c2b7" />
            <Tooltip content={<WaterfallTooltip />} />
            <Bar dataKey="basePos" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="pos" stackId="w" isAnimationActive={false} radius={[4, 4, 0, 0]}>
              {bars.map((bar, i) => (
                <Cell key={i} fill={BAR_COLORS[bar.kind]} />
              ))}
            </Bar>
            <Bar dataKey="baseNeg" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="neg" stackId="w" isAnimationActive={false} radius={[0, 0, 4, 4]}>
              {bars.map((bar, i) => (
                <Cell key={i} fill={BAR_COLORS[bar.kind]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      <p className="muted">
        Azul: desvio favorável · Vermelho: desfavorável · Cinza: totais orçado/realizado
      </p>
    </>
  );
}

function WaterfallTooltip({ active, payload }: { active?: boolean; payload?: { payload: WaterfallBar }[] }) {
  if (!active || !payload?.length) return null;
  const bar = payload[0].payload;
  return (
    <div className="card" style={{ padding: "6px 10px", fontSize: 13, marginBottom: 0 }}>
      {bar.label}: <b>{formatBRL(bar.signed)}</b>
    </div>
  );
}
