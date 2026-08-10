import { useSummaries } from "../../api/hooks";
import type { RealOrc } from "../../api/types";
import { formatK } from "../../lib/money";
import { lastNMonths, monthLabel } from "../../lib/months";
import type { Tone } from "../../lib/tone";

const N_MESES = 6;

export default function BudgetHistoryCard({ month }: { month: string }) {
  const months = lastNMonths(month, N_MESES);
  const results = useSummaries(months);
  const error = results.find((r) => r.error)?.error;

  return (
    <div className="card">
      <div className="budget-hist-head">
        <h2>Histórico — real vs. orçado</h2>
        <span className="sub">investimento em coluna própria</span>
      </div>

      {error && (
        <p className="error">Erro ao carregar o histórico: {(error as Error).message}</p>
      )}

      <div className="budget-hist">
        <div className="budget-hist-row budget-hist-head-row">
          <div>Mês</div>
          <div>Entradas</div>
          <div>Saídas</div>
          <div>Investido</div>
          <div>Saldo</div>
        </div>
        {months.map((m, i) => {
          const s = results[i].data;
          const atual = i === months.length - 1;
          return (
            <div key={m} className={atual ? "budget-hist-row is-current" : "budget-hist-row"}>
              <div className="mono tone-ink-2">{monthLabel(m)}</div>
              {s ? (
                <>
                  <Celula v={s.entradas} />
                  <Celula v={s.saidas} />
                  <Celula
                    v={s.investimentos}
                    tone={s.investimentos.real < 0 ? "over" : "invest"}
                  />
                  <Celula v={s.saldo} tone={s.saldo.real < 0 ? "over" : "accent"} />
                </>
              ) : (
                <>
                  <div className="mono tone-muted">…</div>
                  <div className="mono tone-muted">…</div>
                  <div className="mono tone-muted">…</div>
                  <div className="mono tone-muted">…</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="note budget-hist-note">
        Meses com investido negativo tiveram resgate líquido — o saldo positivo nesses meses
        vem do resgate, não de sobra de renda.
      </p>
    </div>
  );
}

/** `4.599 / 55.217` — realizado em destaque, orçado em cinza, ambos compactos. */
function Celula({ v, tone }: { v: RealOrc; tone?: Tone }) {
  return (
    <div className="mono">
      <span className={v.real !== 0 && tone ? `tone-${tone}` : undefined}>
        {formatK(v.real)}
      </span>
      <span className="tone-muted"> / {formatK(v.orcado)}</span>
    </div>
  );
}
