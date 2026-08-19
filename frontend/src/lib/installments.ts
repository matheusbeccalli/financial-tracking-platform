import type { InstallmentStatus, InstallmentsProjection } from "../api/types";

export interface InstallmentsKpis {
  restanteTotal: number;
  comprasAtivas: number;
  mesesEstouro: number;
  mesesRisco: number;
}

/** Pior status de cada coluna da matriz: estouro > risco > ok. */
export function monthStatuses(p: InstallmentsProjection): InstallmentStatus[] {
  return p.months.map((_, i) => {
    const st = p.categorias.map((c) => c.status[i]);
    if (st.includes("estouro")) return "estouro";
    if (st.includes("risco")) return "risco";
    return "ok";
  });
}

export function installmentsKpis(p: InstallmentsProjection): InstallmentsKpis {
  const statuses = monthStatuses(p);
  return {
    restanteTotal: p.series.reduce((acc, s) => acc + s.restante, 0),
    comprasAtivas: p.series.length,
    mesesEstouro: statuses.filter((s) => s === "estouro").length,
    mesesRisco: statuses.filter((s) => s === "risco").length,
  };
}
