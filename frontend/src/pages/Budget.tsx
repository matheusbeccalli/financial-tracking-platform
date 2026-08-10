import { useMemo, useState } from "react";

import {
  useBudgets,
  useCategories,
  useCopyBudget,
  usePutBudget,
  useSummary,
} from "../api/hooks";
import BudgetHistoryCard from "../components/budget/BudgetHistoryCard";
import BudgetKpis from "../components/budget/BudgetKpis";
import BudgetRail from "../components/budget/BudgetRail";
import CopyFromButton from "../components/budget/CopyFromButton";
import ExpensesCard from "../components/budget/ExpensesCard";
import MonthPicker from "../components/MonthPicker";
import PageHeader from "../components/PageHeader";
import { budgetTotals, expenseRows, type BudgetSort } from "../lib/budget";
import { currentMonth, monthLabel, monthTitle } from "../lib/months";

export default function Budget() {
  const [month, setMonth] = useState(currentMonth());
  const [sort, setSort] = useState<BudgetSort>("valor");

  const budgets = useBudgets(month);
  const cats = useCategories();
  // O realizado entra aqui por causa de dois pontos do design: "R$ 93 já gastos" nas
  // categorias sem orçamento e "Realizado em ago" no card de investimentos.
  const resumo = useSummary(month);
  const lines = budgets.data;
  const categories = cats.data;
  const summary = resumo.data;
  // Sem orçamento ou sem categorias não há o que editar; sem o resumo dá para editar,
  // só faltam os avisos de gasto. Um erro engolido aqui renderizaria um orçamento
  // vazio e convincente, indistinguível de um mês que nunca foi preenchido.
  const erroBase = budgets.error ?? cats.error;
  const carregando = !erroBase && (!lines || !categories);
  const putBudget = usePutBudget();
  const copyBudget = useCopyBudget();

  const orcado = useMemo(
    () => new Map((lines ?? []).map((l) => [l.category_id, l.amount_cents])),
    [lines]
  );
  const real = useMemo(
    () => new Map((summary?.categorias ?? []).map((c) => [c.id, c.real])),
    [summary]
  );

  const ativas = useMemo(() => (categories ?? []).filter((c) => !c.archived), [categories]);
  const view = useMemo(
    () => expenseRows(ativas, orcado, real, sort),
    [ativas, orcado, real, sort]
  );
  const totals = useMemo(() => budgetTotals(ativas, orcado), [ativas, orcado]);

  const salvar = (categoryId: number, cents: number) =>
    putBudget.mutate({ category_id: categoryId, amount_cents: cents, valid_from: month });

  const header = (
    <>
      <PageHeader
        eyebrow="Orçamento"
        title={monthTitle(month)}
        subtitle={`Valores valem a partir de ${monthLabel(month)} até você mudar de novo. Meses passados mantêm o valor que vigorava na época.`}
      >
        <CopyFromButton
          month={month}
          disabled={copyBudget.isPending}
          onCopy={(from) => copyBudget.mutate({ from_month: from, to_month: month })}
        />
        <MonthPicker month={month} onChange={setMonth} />
      </PageHeader>
    </>
  );

  if (erroBase)
    return (
      <>
        {header}
        <p className="error">Erro ao carregar o orçamento: {(erroBase as Error).message}</p>
      </>
    );

  if (carregando)
    return (
      <>
        {header}
        <p className="muted">Carregando…</p>
      </>
    );

  return (
    <>
      {header}

      {resumo.error && (
        <p className="error">
          O realizado do mês não carregou ({(resumo.error as Error).message}); o orçamento
          continua editável, mas sem os avisos de gasto.
        </p>
      )}

      <BudgetKpis t={totals} />

      <section className="budget-grid-main">
        <ExpensesCard view={view} sort={sort} onSort={setSort} onSave={salvar} />
        <BudgetRail
          month={month}
          entradas={ativas.filter((c) => c.kind === "entrada")}
          investimentos={ativas.filter((c) => c.kind === "investimento")}
          orcado={orcado}
          investRealizado={summary?.investimentos.real ?? 0}
          totals={totals}
          onSave={salvar}
        />
      </section>

      <BudgetHistoryCard month={month} />
    </>
  );
}
