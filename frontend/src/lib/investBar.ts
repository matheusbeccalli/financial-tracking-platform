// Estado visual da barra de investimento: líquido do mês (com sinal) vs. meta.
// Superar a meta de aporte é sucesso — não existe "estouro" como nas saídas.
export interface InvestBarView {
  pct: number;
  met: boolean;
  negative: boolean;
}

export function investBarView(realCents: number, orcadoCents: number): InvestBarView {
  if (realCents < 0) return { pct: 0, met: false, negative: true };
  if (orcadoCents > 0)
    return {
      pct: Math.min(100, (realCents / orcadoCents) * 100),
      met: realCents >= orcadoCents,
      negative: false,
    };
  return { pct: realCents > 0 ? 100 : 0, met: false, negative: false };
}
