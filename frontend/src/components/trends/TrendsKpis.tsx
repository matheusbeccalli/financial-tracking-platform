import { formatBRL } from "../../lib/money";
import { monthLabel } from "../../lib/months";
import { LIMIAR_DESVIO, type TrendsStrip } from "../../lib/trends";
import Money from "../Money";

export default function TrendsKpis({
  strip,
  span,
  month,
}: {
  strip: TrendsStrip;
  span: number;
  month: string;
}) {
  const d = strip.deltaPct;
  const deltaTone =
    d !== null && d >= LIMIAR_DESVIO
      ? "tone-warn"
      : d !== null && d <= -LIMIAR_DESVIO
        ? "tone-accent"
        : undefined;
  const deltaLabel =
    d === null
      ? "sem base de comparação"
      : d === 0
        ? "igual à mediana"
        : `${d > 0 ? "+" : "−"}${Math.abs(d)}% vs. a mediana`;

  return (
    <section className="kpi-strip trends-kpis">
      <div className="kpi">
        <div className="label">Saídas típicas — mediana mensal</div>
        <div className="kpi-value">
          <Money cents={strip.medianaSaidas} />
        </div>
        <div className="kpi-note">últimos {span} meses — a mediana ignora meses atípicos</div>
      </div>

      <div className="kpi">
        <div className="label">Saídas orçadas em {monthLabel(month)}</div>
        <div className="kpi-value">
          <Money cents={strip.orcadoAtual} />
        </div>
        <div className="kpi-note">{deltaTone ? <span className={deltaTone}>{deltaLabel}</span> : deltaLabel}</div>
      </div>

      <div className="kpi">
        <div className="label">Categorias fora da média</div>
        <div className="kpi-value mono">{strip.foraDaMedia}</div>
        <div className="kpi-note">desvio acima de 25% entre orçado e média</div>
      </div>

      <div className="kpi">
        <div className="label">Orçado sem histórico</div>
        <div className="kpi-value mono">
          {strip.semHist} {strip.semHist === 1 ? "categoria" : "categorias"}
        </div>
        <div className="kpi-note">
          {strip.semHist > 0 ? (
            <span className="tone-warn">{formatBRL(strip.semHistOrcado)} orçados sem base</span>
          ) : (
            "todas as categorias orçadas têm histórico"
          )}
        </div>
      </div>
    </section>
  );
}
