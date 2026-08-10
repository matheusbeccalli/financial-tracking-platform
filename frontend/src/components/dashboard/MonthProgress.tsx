import type { Dias } from "../../api/types";
import { paceFraction } from "../../lib/dashboard";

/** `dia 10 de 31 ▪▪▫▫ 32%` — o quanto do mês já passou, ao lado do seletor. */
export default function MonthProgress({ dias }: { dias: Dias }) {
  const pct = Math.round(paceFraction(dias) * 100);
  return (
    <div className="month-progress mono">
      <span>
        dia {dias.decorridos} de {dias.no_mes}
      </span>
      <span className="month-progress-track">
        <span className="month-progress-fill" style={{ width: `${pct}%` }} />
      </span>
      <span>{pct}%</span>
    </div>
  );
}
