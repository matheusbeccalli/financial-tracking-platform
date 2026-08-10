import type { Category } from "../../api/types";
import type { BudgetTotals } from "../../lib/budget";
import { formatBRL } from "../../lib/money";
import { monthLabel } from "../../lib/months";
import { pctOf } from "../../lib/pct";
import BudgetInput from "../BudgetInput";
import Money from "../Money";
import ProgressBar from "../ProgressBar";

export default function BudgetRail({
  month,
  entradas,
  investimentos,
  orcado,
  investRealizado,
  totals,
  onSave,
}: {
  month: string;
  entradas: Category[];
  investimentos: Category[];
  orcado: Map<number, number>;
  /** Líquido investido no mês (com sinal), vindo do summary. */
  investRealizado: number;
  totals: BudgetTotals;
  onSave: (categoryId: number, cents: number) => void;
}) {
  const pctMeta = pctOf(investRealizado, totals.investimento);

  return (
    <div className="budget-rail">
      <div className="card">
        <h2>Entradas</h2>
        <div className="budget-rail-rows">
          {entradas.map((c) => {
            const cents = orcado.get(c.id) ?? 0;
            return (
              <div key={c.id} className="budget-rail-row">
                <span className={cents > 0 ? undefined : "tone-muted"}>{c.name}</span>
                <BudgetInput
                  cents={cents}
                  width={112}
                  className={cents > 0 ? "mono" : "mono dashed"}
                  ariaLabel={`Orçamento de ${c.name}`}
                  onSave={(v) => onSave(c.id, v)}
                />
              </div>
            );
          })}
        </div>
        <div className="budget-rail-total">
          <span>Total</span>
          <Money cents={totals.entradas} tone="accent" />
        </div>
      </div>

      <div className="card budget-invest-card">
        <div className="budget-invest-head">
          <span className="swatch tone-invest" />
          <h2>Investimentos</h2>
        </div>
        <p className="note">
          Meta de aporte. Move patrimônio, não é despesa — fica fora do total de saídas.
        </p>
        <div className="budget-rail-rows">
          {investimentos.map((c) => (
            <div key={c.id} className="budget-rail-row">
              <span>{c.name}</span>
              <BudgetInput
                cents={orcado.get(c.id) ?? 0}
                width={112}
                className="mono invest"
                ariaLabel={`Meta de aporte de ${c.name}`}
                onSave={(v) => onSave(c.id, v)}
              />
            </div>
          ))}
          {investimentos.length === 0 && (
            <p className="muted">Nenhuma categoria de investimento.</p>
          )}
        </div>
        <div className="budget-rail-total budget-invest-real">
          <span className="tone-muted">
            {investRealizado < 0 ? "Resgate líquido em" : "Realizado em"} {monthLabel(month)}
          </span>
          <Money
            cents={investRealizado}
            alwaysSign
            tone={investRealizado < 0 ? "over" : "invest"}
          />
        </div>
        <div className="budget-invest-bar">
          <ProgressBar
            pct={pctMeta}
            tone={investRealizado < 0 ? "over" : "invest"}
            height={5}
            ariaLabel="Aporte realizado sobre a meta"
          />
        </div>
        <div className="sub">
          {totals.investimento > 0
            ? investRealizado < 0
              ? "resgatou mais do que aportou no mês"
              : `${Math.round(pctMeta)}% da meta do mês`
            : "sem meta definida"}
        </div>
      </div>

      <div className="card">
        <h2>Como o mês fecha</h2>
        <div className="budget-fecha">
          <div>
            <span className="tone-muted">Entradas</span>
            <Money cents={totals.entradas} alwaysSign tone="accent" />
          </div>
          <div>
            <span className="tone-muted">Saídas</span>
            <Money cents={-totals.saidas} />
          </div>
          <div className="budget-fecha-sub">
            <span>Operacional</span>
            <Money
              cents={totals.operacional}
              alwaysSign
              tone={totals.operacional < 0 ? "over" : "accent"}
            />
          </div>
          <div>
            <span className="tone-muted">Aporte planejado</span>
            <Money cents={-totals.investimento} tone="invest" />
          </div>
          <div className="budget-fecha-total">
            <span>Saldo líquido</span>
            <Money
              cents={totals.liquido}
              alwaysSign
              tone={totals.liquido < 0 ? "over" : "accent"}
            />
          </div>
        </div>
        <p className="note">
          {totals.operacional < 0
            ? `O orçamento não fecha antes do aporte: são ${formatBRL(-totals.operacional)} a cortar nas saídas.`
            : totals.liquido < 0
              ? `O operacional fecha, mas o aporte de ${formatBRL(totals.investimento)} não cabe — sobra ${formatBRL(totals.operacional)}.`
              : "O orçamento fecha com folga, já contando o aporte planejado."}
        </p>
      </div>
    </div>
  );
}
