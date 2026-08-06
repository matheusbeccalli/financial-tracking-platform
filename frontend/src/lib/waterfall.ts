import type { Bridge } from "../api/types";

export interface WaterfallBar {
  label: string;
  base: number;
  value: number;
  kind: "total" | "up" | "down";
}

export function buildWaterfall(b: Bridge): WaterfallBar[] {
  const bars: WaterfallBar[] = [
    { label: "Orçado", base: 0, value: b.start, kind: "total" },
  ];
  let acc = b.start;
  for (const s of b.steps) {
    const from = acc;
    acc += s.delta;
    bars.push({
      label: s.categoria,
      base: Math.min(from, acc),
      value: Math.abs(s.delta),
      kind: s.delta >= 0 ? "up" : "down",
    });
  }
  bars.push({ label: "Realizado", base: 0, value: b.end, kind: "total" });
  return bars;
}
