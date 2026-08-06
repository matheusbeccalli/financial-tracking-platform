import { useState } from "react";

import CategoryBars from "../components/dashboard/CategoryBars";
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
      <div className="card">
        <CategoryBars month={month} />
      </div>
    </>
  );
}
