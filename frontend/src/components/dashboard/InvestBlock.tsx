import { useCategories, useTransactions } from "../../api/hooks";
import { investBidi, investSummary } from "../../lib/dashboard";
import Money from "../Money";
import Pill from "../Pill";

/**
 * Aportes e resgates do mês. O summary só traz o líquido, então os brutos saem dos
 * lançamentos das categorias de investimento.
 */
export default function InvestBlock({ month, meta }: { month: string; meta: number }) {
  const { data: categories } = useCategories();
  const { data: txs } = useTransactions({ month });
  if (!categories || !txs) return null;

  const investIds = new Set(
    categories.filter((c) => c.kind === "investimento").map((c) => c.id)
  );
  const v = investSummary(txs, investIds, meta);
  const bar = investBidi(v.liquido, v.meta);
  const aporte = v.liquido >= 0;

  return (
    <div className="invest-block">
      <div className="invest-block-head">
        <span className="swatch tone-invest" />
        <span className="invest-block-title">Investimentos</span>
        <span className="sub">movimento de patrimônio — não conta como gasto</span>
      </div>

      <div className="invest-metrics">
        <div>
          <div className="label">Aportes</div>
          <div className="invest-metric-value">
            <Money cents={v.aportes} alwaysSign tone="invest" />
          </div>
          <div className="sub">
            {v.nAportes} {v.nAportes === 1 ? "lançamento" : "lançamentos"}
          </div>
        </div>
        <div>
          <div className="label">Resgates</div>
          <div className="invest-metric-value">
            <Money cents={-v.resgates} tone="ink-2" zeroDash />
          </div>
          <div className="sub">
            {v.nResgates} {v.nResgates === 1 ? "lançamento" : "lançamentos"}
          </div>
        </div>
        <div className="invest-metric-liquid">
          <div className="label">Líquido</div>
          <div className="invest-metric-value invest-metric-row">
            <Money cents={v.liquido} alwaysSign tone={aporte ? "invest" : "over"} />
            <Pill tone={aporte ? "invest" : "over"}>{aporte ? "aporte" : "resgate"}</Pill>
          </div>
          <div className="sub">
            {aporte ? "patrimônio cresceu no mês" : "patrimônio encolheu no mês"}
          </div>
        </div>
        <div>
          <div className="label">Meta mensal</div>
          <div className="invest-metric-value">
            <Money cents={v.meta} tone="ink-2" zeroDash />
          </div>
          <div className="sub">
            {v.meta > 0 ? `${Math.round(v.pctMeta)}% atingido` : "sem meta definida"}
          </div>
        </div>
      </div>

      <div className="invest-bidi" role="img" aria-label="Líquido investido no mês">
        <span
          className="invest-bidi-fill"
          style={{
            left: `${bar.leftPct}%`,
            width: `${bar.widthPct}%`,
            background: aporte ? "var(--invest)" : "var(--over)",
          }}
        />
        <span className="invest-bidi-zero" />
      </div>
      <div className="invest-bidi-scale">
        <span>resgate líquido</span>
        <span>0</span>
        <span>aporte líquido</span>
      </div>
    </div>
  );
}
