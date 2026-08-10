import type { Summary } from "../../api/types";
import { formatBRL } from "../../lib/money";
import { pctOf } from "../../lib/pct";
import Money from "../Money";
import Pill from "../Pill";
import ProgressBar from "../ProgressBar";

/** Denominador das barras dos KPIs: "0% de 51.712" — sem "R$", só o número. */
const semMoeda = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export default function KpiStrip({ s }: { s: Summary }) {
  const entradasPct = pctOf(s.entradas.real, s.entradas.orcado);
  const saidasPct = pctOf(s.saidas.real, s.saidas.orcado);
  const pacePct = s.dias.no_mes > 0 ? (s.dias.decorridos / s.dias.no_mes) * 100 : 0;
  const aporte = s.investimentos.real >= 0;
  const ritmo = s.ritmo === null ? null : Math.round(s.ritmo);

  return (
    <section className="kpi-strip">
      <div className="kpi">
        <div className="label">Entradas</div>
        <div className="kpi-value">
          <Money cents={s.entradas.real} />
        </div>
        <div className="kpi-bar">
          <ProgressBar pct={entradasPct} height={3} ariaLabel="Entradas realizadas" />
          <span className="kpi-bar-note mono">
            {Math.round(entradasPct)}% de {semMoeda(s.entradas.orcado)}
          </span>
        </div>
      </div>

      <div className="kpi">
        <div className="label">Saídas</div>
        <div className="kpi-value">
          <Money cents={s.saidas.real} />
        </div>
        <div className="kpi-bar">
          <ProgressBar
            pct={saidasPct}
            pace={pacePct}
            height={3}
            ariaLabel="Saídas realizadas"
          />
          <span className="kpi-bar-note mono">
            {Math.round(saidasPct)}% de {semMoeda(s.saidas.orcado)}
          </span>
        </div>
      </div>

      <div className="kpi kpi--invest">
        <div className="label kpi-label-dot">
          <span className="swatch tone-invest" />
          Investido
        </div>
        <div className="kpi-value kpi-value-row">
          <Money cents={s.investimentos.real} alwaysSign tone={aporte ? "invest" : "over"} />
          <Pill tone={aporte ? "invest" : "over"}>{aporte ? "aporte" : "resgate"}</Pill>
        </div>
        <div className="kpi-note">líquido do mês · fora do orçamento</div>
      </div>

      <div className="kpi">
        <div className="label">Saldo</div>
        <div className="kpi-value">
          <Money cents={s.saldo.real} tone="ink" />
        </div>
        <div className="kpi-note mono">orçado {formatBRL(s.saldo.orcado)}</div>
      </div>

      <div className="kpi kpi--pace">
        <div className="label">Ritmo das saídas</div>
        <div className="kpi-value mono">
          {ritmo === null ? (
            <span className="tone-muted">—</span>
          ) : (
            <span className={ritmo > 0 ? "tone-over" : "tone-accent"}>
              {ritmo > 0 ? "+" : ritmo < 0 ? "−" : ""}
              {Math.abs(ritmo)} pts
            </span>
          )}
        </div>
        <div className="kpi-note">
          {ritmo === null
            ? "sem orçamento de saídas"
            : `gastou ${Math.round(saidasPct)}% do orçado com ${Math.round(pacePct)}% do mês corrido`}
        </div>
      </div>
    </section>
  );
}
