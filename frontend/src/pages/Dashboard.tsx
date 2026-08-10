import { useState } from "react";

import { useSummary } from "../api/hooks";
import BridgeChart from "../components/dashboard/BridgeChart";
import BurningCard from "../components/dashboard/BurningCard";
import EvolutionChart from "../components/dashboard/EvolutionChart";
import KpiStrip from "../components/dashboard/KpiStrip";
import LlmStrip from "../components/dashboard/LlmStrip";
import MonthProgress from "../components/dashboard/MonthProgress";
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
      {s && <KpiStrip s={s} />}

      <LlmStrip />
      <div className="row" style={{ alignItems: "stretch" }}>
        <div style={{ flex: 2, minWidth: 340 }}>{s && <BurningCard s={s} month={month} />}</div>
        <div className="card" style={{ flex: 1, minWidth: 260 }}>
          <EvolutionChart month={month} />
        </div>
      </div>
      <div className="card">
        <BridgeChart refMonth={month} />
      </div>
    </>
  );
}
