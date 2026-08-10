import { useState } from "react";

import { useSummary } from "../api/hooks";
import BridgeCard from "../components/dashboard/BridgeCard";
import BurningCard from "../components/dashboard/BurningCard";
import DonutCard from "../components/dashboard/DonutCard";
import KpiStrip from "../components/dashboard/KpiStrip";
import LlmStrip from "../components/dashboard/LlmStrip";
import MonthProgress from "../components/dashboard/MonthProgress";
import MonthsCard from "../components/dashboard/MonthsCard";
import NotRealizedCard from "../components/dashboard/NotRealizedCard";
import MonthPicker from "../components/MonthPicker";
import PageHeader from "../components/PageHeader";
import { currentMonth, monthTitle } from "../lib/months";

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const { data: s, error } = useSummary(month);

  return (
    <>
      <PageHeader eyebrow="Dashboard" title={monthTitle(month)}>
        {s && <MonthProgress dias={s.dias} />}
        <MonthPicker month={month} onChange={setMonth} />
      </PageHeader>

      {error && <p className="error">Erro ao carregar resumo: {(error as Error).message}</p>}
      {!s && !error && <p className="muted">Carregando…</p>}

      {s && (
        <>
          <KpiStrip s={s} />
          <LlmStrip />
          <section className="dash-grid">
            <BurningCard s={s} month={month} />
            <div className="dash-col">
              <DonutCard s={s} month={month} />
              <MonthsCard month={month} dias={s.dias} />
              <NotRealizedCard s={s} month={month} />
            </div>
          </section>
          <BridgeCard refMonth={month} />
        </>
      )}
    </>
  );
}
