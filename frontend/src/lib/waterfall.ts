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

export interface WaterfallLayoutBar {
  label: string;
  kind: WaterfallBar["kind"];
  signed: number;
  topPct: number;
  heightPct: number;
}

/**
 * Converte os segmentos em centavos para posição no gráfico: `topPct` medido do
 * topo do domínio para baixo, como o CSS espera.
 *
 * Cada segmento cobre um intervalo [lo, hi] que o `buildWaterfall` guarda partido
 * em parte positiva (basePos/pos) e negativa (baseNeg/neg, com `neg` ≤ 0), então
 * os dois extremos são reconstruídos aqui.
 */
export function waterfallLayout(bars: WaterfallBar[]): WaterfallLayoutBar[] {
  const hiOf = (b: WaterfallBar) => (b.pos > 0 ? b.basePos + b.pos : b.baseNeg);
  const loOf = (b: WaterfallBar) => (b.neg < 0 ? b.baseNeg + b.neg : b.basePos);
  const max = Math.max(0, ...bars.map(hiOf));
  const min = Math.min(0, ...bars.map(loOf));
  const span = max - min;
  return bars.map((b) => ({
    label: b.label,
    kind: b.kind,
    signed: b.signed,
    topPct: span > 0 ? ((max - hiOf(b)) / span) * 100 : 0,
    heightPct: span > 0 ? ((hiOf(b) - loOf(b)) / span) * 100 : 0,
  }));
}
