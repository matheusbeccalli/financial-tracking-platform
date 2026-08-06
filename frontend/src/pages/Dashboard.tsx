import { useState } from "react";

import BridgeChart from "../components/dashboard/BridgeChart";
import CategoryBars from "../components/dashboard/CategoryBars";
import EvolutionChart from "../components/dashboard/EvolutionChart";
import KpiRow from "../components/dashboard/KpiRow";
import MonthPicker from "../components/MonthPicker";
import { currentMonth } from "../lib/months";

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Dashboard</h2>
        <MonthPicker month={month} onChange={setMonth} />
      </div>
      <KpiRow month={month} />
      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="card" style={{ flex: 2, minWidth: 340 }}>
          <CategoryBars month={month} />
        </div>
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
