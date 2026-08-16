/** Data local em YYYY-MM-DD — toISOString() usaria UTC e viraria o dia à noite. */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * Sugestão de "sincronizar a partir de": dia seguinte à última transação da
 * conta local — protege o histórico importado por arquivo (o dedupe não cruza
 * fontes: a descrição da Pluggy difere da do OFX). Conta sem transações: hoje.
 */
export function syncFromSuggestion(lastTx: string | undefined, today: string): string {
  if (!lastTx) return today;
  const d = new Date(`${lastTx}T12:00:00`); // meio-dia evita surpresa de fuso
  d.setDate(d.getDate() + 1);
  return todayISO(d);
}
