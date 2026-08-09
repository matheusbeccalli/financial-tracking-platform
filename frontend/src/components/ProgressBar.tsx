import { clampPct } from "../lib/pct";
import type { Tone } from "../lib/tone";

/**
 * Barra de progresso. `pace` desenha a marca de ritmo do mês: estar à esquerda
 * dela é estar dentro do ritmo — leitura que o "% do orçado consumido" não dá.
 */
export default function ProgressBar({
  pct,
  pace,
  tone = "accent",
  height = 5,
  dashed = false,
  ariaLabel,
}: {
  pct: number;
  pace?: number;
  tone?: Tone;
  height?: number;
  dashed?: boolean;
  ariaLabel?: string;
}) {
  const value = clampPct(pct);
  return (
    <div
      className={`bar tone-${tone}`}
      style={{ height }}
      role="img"
      aria-label={ariaLabel ?? `${Math.round(value)}%`}
    >
      <div
        className={dashed ? "bar-value dashed" : "bar-value"}
        style={{ width: `${value}%` }}
      />
      {pace !== undefined && (
        <span className="bar-pace" style={{ left: `${clampPct(pace)}%` }} />
      )}
    </div>
  );
}
