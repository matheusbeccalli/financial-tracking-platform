import { useSummaries } from "../../api/hooks";
import type { RealOrc } from "../../api/types";
import { formatUnits } from "../../lib/money";
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

      {/* Tabela de verdade, não um grid de divs: cada célula é um par
          "realizado / orçado" e só se lê associada ao cabeçalho da coluna. */}
      <table className="budget-hist">
        <thead>
          <tr>
            <th>Mês</th>
            <th>Entradas</th>
            <th>Saídas</th>
            <th>Investido</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m, i) => {
            const s = results[i].data;
            const atual = i === months.length - 1;
            return (
              <tr key={m} className={atual ? "is-current" : undefined}>
                <td className="mono tone-ink-2">{monthLabel(m)}</td>
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
                    <td className="mono tone-muted">…</td>
                    <td className="mono tone-muted">…</td>
                    <td className="mono tone-muted">…</td>
                    <td className="mono tone-muted">…</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="note budget-hist-note">
        Meses com investido negativo tiveram resgate líquido — o saldo positivo nesses meses
        vem do resgate, não de sobra de renda.
      </p>
    </div>
  );
}

/** `4.599 / 55.217` — realizado em destaque, orçado em cinza, ambos sem centavos. */
function Celula({ v, tone }: { v: RealOrc; tone?: Tone }) {
  return (
    <td className="mono">
      <span className={v.real !== 0 && tone ? `tone-${tone}` : undefined}>
        {formatUnits(v.real)}
      </span>
      <span className="tone-muted"> / {formatUnits(v.orcado)}</span>
    </td>
  );
}
