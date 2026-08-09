import { useCategories, usePutBudget, useSummaries } from "../api/hooks";
import type { CategoryKind, Summary } from "../api/types";
import BudgetInput from "../components/BudgetInput";
import { formatBRL } from "../lib/money";
import { currentMonth, monthLabel } from "../lib/months";
import {
  buildTrends,
  otimista,
  trendsWindow,
  type TrendsRow,
  type TrendsTotals,
} from "../lib/trends";

const KIND_LABELS: Record<CategoryKind, string> = {
  entrada: "Entradas",
  saida: "Saídas",
  investimento: "Investimentos",
};

export default function Trends() {
  const { pastMonths, planMonths } = trendsWindow(currentMonth());
  const results = useSummaries([...pastMonths, ...planMonths]);
  const { data: categories } = useCategories();
  const putBudget = usePutBudget();
  const summaries = results.map((r) => r.data);
  const nCols = pastMonths.length + planMonths.length + 2; // rótulo + média

  if (!categories || summaries.some((s) => s === undefined))
    return (
      <>
        <h2>Tendências e Projeção</h2>
        <p className="muted">Carregando…</p>
      </>
    );

  const m = buildTrends(pastMonths.length, summaries as Summary[], categories);
  const save = (categoryId: number, cents: number, month: string) =>
    putBudget.mutate({ category_id: categoryId, amount_cents: cents, valid_from: month });

  return (
    <>
      <h2>Tendências e Projeção</h2>
      <p className="muted">
        Passado mostra o realizado; mês atual e seguintes mostram o orçamento vigente —
        valores salvos valem a partir do mês da coluna até você mudar de novo.
      </p>
      <div className="card trends-wrap">
        <table>
          <thead>
            <tr>
              <th className="sticky"></th>
              {pastMonths.map((mo) => (
                <th key={mo} className="num">
                  {monthLabel(mo)}
                </th>
              ))}
              <th className="num">média 6m</th>
              {planMonths.map((mo, i) => (
                <th key={mo} className={i === 0 ? "num cur" : "num"}>
                  {monthLabel(mo)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["entrada", "saida", "investimento"] as const).map((kind) => (
              <SectionRows
                key={kind}
                kind={kind}
                rows={m.rows[kind]}
                totals={m.totals[kind]}
                planMonths={planMonths}
                nCols={nCols}
                onSave={save}
              />
            ))}
            <tr>
              <td className="sticky">
                <b>Saldo do mês</b>
              </td>
              {m.saldoPast.map((v, i) => (
                <Money key={i} v={v} tone />
              ))}
              <td className="num muted">
                <b>{formatBRL(Math.round(m.saldoMedia))}</b>
              </td>
              {m.saldoPlan.map((v, i) => (
                <Money key={i} v={v} tone cur={i === 0} />
              ))}
            </tr>
            <tr>
              <td className="sticky">
                <b>Acumulado</b>
              </td>
              {pastMonths.map((mo) => (
                <td key={mo} className="num muted">
                  —
                </td>
              ))}
              <td className="num muted">—</td>
              {m.acumulado.map((v, i) => (
                <Money key={i} v={v} tone cur={i === 0} />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Money({ v, tone, cur }: { v: number; tone?: boolean; cur?: boolean }) {
  const style = tone ? { color: v >= 0 ? "var(--good)" : "var(--critical)" } : undefined;
  return (
    <td className={cur ? "num cur" : "num"} style={style}>
      {formatBRL(v)}
    </td>
  );
}

function SectionRows({
  kind,
  rows,
  totals,
  planMonths,
  nCols,
  onSave,
}: {
  kind: CategoryKind;
  rows: TrendsRow[];
  totals: TrendsTotals;
  planMonths: string[];
  nCols: number;
  onSave: (categoryId: number, cents: number, month: string) => void;
}) {
  return (
    <>
      <tr>
        <td className="sticky section">{KIND_LABELS[kind]}</td>
        <td colSpan={nCols - 1}></td>
      </tr>
      {rows.map((row) => (
        <tr key={row.id}>
          <td className="sticky">{row.nome}</td>
          {row.past.map((v, i) => (
            <td key={i} className="num">
              {v ? formatBRL(v) : "—"}
            </td>
          ))}
          <td className="num muted">{formatBRL(Math.round(row.media))}</td>
          {row.plan.map((v, i) => (
            <td key={planMonths[i]} className={i === 0 ? "num cur" : "num"}>
              <BudgetInput
                cents={v}
                width={90}
                onSave={(cents) => onSave(row.id, cents, planMonths[i])}
              />
            </td>
          ))}
        </tr>
      ))}
      <tr>
        <td className="sticky">
          <b>Total {KIND_LABELS[kind].toLowerCase()}</b>
        </td>
        {totals.past.map((v, i) => (
          <td key={i} className="num">
            <b>{formatBRL(v)}</b>
          </td>
        ))}
        <td className="num muted">
          <b>{formatBRL(Math.round(totals.media))}</b>
        </td>
        {totals.plan.map((v, i) => (
          <td key={planMonths[i]} className={i === 0 ? "num cur" : "num"}>
            <b>{formatBRL(v)}</b>
            {otimista(kind, totals.media, v) && (
              <span
                className="badge"
                style={{ color: "var(--critical)", marginLeft: 4 }}
                title="destoa da média 6m"
              >
                ⚠
              </span>
            )}
          </td>
        ))}
      </tr>
    </>
  );
}
