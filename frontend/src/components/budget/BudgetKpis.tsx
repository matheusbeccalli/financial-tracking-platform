import type { BudgetTotals } from "../../lib/budget";
import Money from "../Money";

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

export default function BudgetKpis({ t }: { t: BudgetTotals }) {
  return (
    <section className="kpi-strip budget-kpis">
      <div className="kpi">
        <div className="label">Entradas orçadas</div>
        <div className="kpi-value">
          <Money cents={t.entradas} tone="accent" />
        </div>
        <div className="kpi-note">
          {t.entradasPreenchidas} de {t.entradasLinhas} linhas preenchidas
        </div>
      </div>

      <div className="kpi">
        <div className="label">Saídas orçadas</div>
        <div className="kpi-value">
          <Money cents={t.saidas} />
        </div>
        <div className="kpi-note">
          {t.entradas > 0 ? `${Math.round(t.saidasPctEntradas)}% das entradas · ` : ""}
          {t.saidasCategorias} categorias
        </div>
      </div>

      <div className={t.operacional < 0 ? "kpi kpi--negativo" : "kpi"}>
        <div className="label">Saldo operacional</div>
        <div className="kpi-value">
          <Money cents={t.operacional} tone={t.operacional < 0 ? "over" : "accent"} />
        </div>
        <div className="kpi-note">entradas − saídas, sem investimento</div>
      </div>

      <div className="kpi kpi--invest">
        <div className="label kpi-label-dot">
          <span className="swatch tone-invest" />
          Aporte alvo
        </div>
        <div className="kpi-value">
          <Money cents={t.investimento} tone="invest" />
        </div>
        <div className="kpi-note">
          {t.entradas > 0 ? `${pct(t.investPctEntradas)} das entradas · ` : ""}não é gasto
        </div>
      </div>
    </section>
  );
}
