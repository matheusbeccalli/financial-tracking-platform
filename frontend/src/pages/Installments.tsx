import { useState } from "react";

import { useInstallmentsProjection } from "../api/hooks";
import Money from "../components/Money";
import MonthPicker from "../components/MonthPicker";
import PageHeader from "../components/PageHeader";
import InstallmentsMatrix from "../components/installments/InstallmentsMatrix";
import SeriesTable from "../components/installments/SeriesTable";
import { installmentsKpis } from "../lib/installments";
import { addMonths, currentMonth, monthName } from "../lib/months";

export default function Installments() {
  // último mês completo: a fatura do mês corrente ainda está aberta
  const [month, setMonth] = useState(() => addMonths(currentMonth(), -1));
  const { data, error, isLoading } = useInstallmentsProjection(month);

  const header = (
    <PageHeader
      eyebrow="Parcelamentos"
      title="Parcelas contratadas"
      subtitle={`Compras parceladas lidas da fatura de ${monthName(month)}, projetadas nos meses seguintes e comparadas ao orçamento vigente de cada categoria.`}
    >
      <MonthPicker month={month} onChange={setMonth} />
    </PageHeader>
  );

  if (error)
    return (
      <>
        {header}
        <p className="error">Erro ao carregar projeção: {(error as Error).message}</p>
      </>
    );
  if (isLoading || !data)
    return (
      <>
        {header}
        <p className="muted">Carregando…</p>
      </>
    );
  if (data.series.length === 0)
    return (
      <>
        {header}
        <div className="card muted">
          Nenhuma compra parcelada na fatura de {monthName(month)}. Faturas importadas e
          sincronizações da Pluggy alimentam esta tela automaticamente.
        </div>
      </>
    );

  const kpis = installmentsKpis(data);
  return (
    <>
      {header}
      <section className="kpi-strip">
        <div className="kpi">
          <div className="label">Restante contratado</div>
          <div className="kpi-value">
            <Money cents={kpis.restanteTotal} />
          </div>
          <div className="kpi-note">soma das parcelas ainda por pagar</div>
        </div>
        <div className="kpi">
          <div className="label">Compras ativas</div>
          <div className="kpi-value mono">{kpis.comprasAtivas}</div>
          <div className="kpi-note">parceladas na fatura de {monthName(month)}</div>
        </div>
        <div className="kpi">
          <div className="label">Meses com estouro</div>
          <div className="kpi-value mono">
            {kpis.mesesEstouro > 0 ? (
              <span className="tone-over">{kpis.mesesEstouro}</span>
            ) : (
              kpis.mesesEstouro
            )}
          </div>
          <div className="kpi-note">parcelas acima do orçamento da categoria</div>
        </div>
        <div className="kpi">
          <div className="label">Meses em risco</div>
          <div className="kpi-value mono">
            {kpis.mesesRisco > 0 ? (
              <span className="tone-warn">{kpis.mesesRisco}</span>
            ) : (
              kpis.mesesRisco
            )}
          </div>
          <div className="kpi-note">parcelas tomam ≥ 80% do orçamento</div>
        </div>
      </section>
      {data.months.length > 0 && <InstallmentsMatrix p={data} />}
      <SeriesTable series={data.series} />
    </>
  );
}
