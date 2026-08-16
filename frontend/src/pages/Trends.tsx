import { useRef, useState } from "react";

import { useCategories, usePutBudget, useSummaries } from "../api/hooks";
import type { Summary } from "../api/types";
import PageHeader from "../components/PageHeader";
import Segmented from "../components/Segmented";
import MatrixCard from "../components/trends/MatrixCard";
import TrendsKpis from "../components/trends/TrendsKpis";
import { currentMonth, monthLabel, monthName } from "../lib/months";
import { applyOrder, buildTrends, trendsStrip, trendsWindow } from "../lib/trends";

const SPANS = [
  { value: "3" as const, label: "3 m" },
  { value: "6" as const, label: "6 m" },
];

export default function Trends() {
  const [span, setSpan] = useState<"3" | "6">("6");
  const saidaOrder = useRef<number[] | null>(null);
  const today = currentMonth();
  const { pastMonths, planMonths } = trendsWindow(today, Number(span));
  const results = useSummaries([...pastMonths, ...planMonths]);
  const { data: categories } = useCategories();
  const putBudget = usePutBudget();
  const summaries = results.map((r) => r.data);
  const error = results.find((r) => r.error)?.error;

  const header = (
    <PageHeader
      eyebrow="Tendências"
      title="Realizado e projeção"
      subtitle={`Meses fechados mostram o realizado. De ${monthName(today)} em diante é o orçamento vigente, editável — o valor salvo vale a partir daquele mês.`}
    >
      <span className="trends-range">
        {monthLabel(pastMonths[0])}–{monthLabel(pastMonths[pastMonths.length - 1])} realizado ·{" "}
        {monthLabel(planMonths[0])}–{monthLabel(planMonths[planMonths.length - 1])} orçado
      </span>
      <Segmented
        value={span}
        options={SPANS}
        onChange={(v) => {
          saidaOrder.current = null; // trocar a janela é momento deliberado de re-rankear
          setSpan(v);
        }}
        ariaLabel="Janela de meses"
      />
    </PageHeader>
  );

  if (error)
    return (
      <>
        {header}
        <p className="error">Erro ao carregar resumo: {(error as Error).message}</p>
      </>
    );
  if (!categories || summaries.some((s) => s === undefined))
    return (
      <>
        {header}
        <p className="muted">Carregando…</p>
      </>
    );

  const m = buildTrends(pastMonths.length, summaries as Summary[], categories);
  if (saidaOrder.current === null) saidaOrder.current = m.rows.saida.map((r) => r.id);
  m.rows.saida = applyOrder(m.rows.saida, saidaOrder.current);
  const strip = trendsStrip(m);
  const save = (categoryId: number, cents: number, month: string) =>
    putBudget.mutate({ category_id: categoryId, amount_cents: cents, valid_from: month });

  return (
    <>
      {header}
      <TrendsKpis strip={strip} span={pastMonths.length} month={today} />
      <MatrixCard m={m} pastMonths={pastMonths} planMonths={planMonths} onSave={save} />
    </>
  );
}
