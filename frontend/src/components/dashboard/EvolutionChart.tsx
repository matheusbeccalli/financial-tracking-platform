import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useSummaries } from "../../api/hooks";
import { formatBRL } from "../../lib/money";
import { lastNMonths, monthLabel } from "../../lib/months";

export default function EvolutionChart({ month }: { month: string }) {
  const months = lastNMonths(month, 6);
  const results = useSummaries(months);
  const data = months.map((m, i) => ({
    label: monthLabel(m),
    saidas: results[i].data?.saidas.real ?? 0,
  }));
  return (
    <>
      <h3>Saídas — últimos 6 meses</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#898781" }}
            axisLine={{ stroke: "#c3c2b7" }}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip formatter={(v) => formatBRL(Number(v))} />
          <Bar dataKey="saidas" name="Saídas" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={i === data.length - 1 ? "#1c5cab" : "#2a78d6"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
