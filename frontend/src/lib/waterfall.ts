import type { Bridge } from "../api/types";

export interface WaterfallBar {
  label: string;
  basePos: number;
  pos: number;
  baseNeg: number;
  neg: number;
  kind: "total" | "up" | "down";
  signed: number;
}

function segment(
  label: string,
  lo: number,
  hi: number,
  kind: WaterfallBar["kind"],
  signed: number
): WaterfallBar {
  return {
    label,
    basePos: Math.max(lo, 0),
    pos: Math.max(hi, 0) - Math.max(lo, 0),
    baseNeg: Math.min(hi, 0),
    neg: Math.min(lo, 0) - Math.min(hi, 0),
    kind,
    signed,
  };
}

export function buildWaterfall(b: Bridge): WaterfallBar[] {
  const bars = [
    segment("Orçado", Math.min(0, b.start), Math.max(0, b.start), "total", b.start),
  ];
  let acc = b.start;
  for (const s of b.steps) {
    const from = acc;
    acc += s.delta;
    bars.push(
      segment(
        s.categoria,
        Math.min(from, acc),
        Math.max(from, acc),
        s.delta >= 0 ? "up" : "down",
        s.delta
      )
    );
  }
  bars.push(segment("Realizado", Math.min(0, b.end), Math.max(0, b.end), "total", b.end));
  return bars;
}
