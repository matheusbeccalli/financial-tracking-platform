/** Percentual de barra: nunca sai de 0–100, nunca vira NaN. */
export function clampPct(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** Fração parte/total em percentual; total ausente ou não-positivo vira 0. */
export function pctOf(part: number, total: number): number {
  return total > 0 ? clampPct((part / total) * 100) : 0;
}

/**
 * Percentual SEM teto. `pctOf` satura em 100, o que serve para largura de barra mas
 * mente no texto: "100% consumido" para quem gastou 250% do orçado esconde o estouro.
 * Quem desenha barra é que clampa.
 */
export function pctRaw(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}
