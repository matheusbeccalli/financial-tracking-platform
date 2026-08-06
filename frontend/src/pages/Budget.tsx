import { useEffect, useState } from "react";

import { useBudgets, useCategories, usePutBudget, useSummaries } from "../api/hooks";
import MonthPicker from "../components/MonthPicker";
import { formatBRL, parseBRL } from "../lib/money";
import { currentMonth, lastNMonths, monthLabel } from "../lib/months";

export default function Budget() {
  const [month, setMonth] = useState(currentMonth());
  const { data: lines } = useBudgets(month);
  const { data: categories } = useCategories();
  const putBudget = usePutBudget();

  const budgetById = new Map((lines ?? []).map((l) => [l.category_id, l.amount_cents]));
  const active = (categories ?? []).filter((c) => !c.archived);
  const total = (kind: "entrada" | "saida") =>
    active
      .filter((c) => c.kind === kind)
      .reduce((sum, c) => sum + (budgetById.get(c.id) ?? 0), 0);
  const saldoProjetado = total("entrada") - total("saida");

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Orçamento</h2>
        <MonthPicker month={month} onChange={setMonth} />
      </div>
      <p className="muted">
        Valores salvos valem a partir de {monthLabel(month)} até você mudar de novo. Meses
        passados mantêm o valor que vigorava na época.
      </p>
      <div className="row" style={{ alignItems: "flex-start" }}>
        {(["entrada", "saida"] as const).map((kind) => (
          <div key={kind} className="card" style={{ flex: 1, minWidth: 320 }}>
            <h3>{kind === "entrada" ? "Entradas" : "Saídas"}</h3>
            <table>
              <tbody>
                {active
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="num" style={{ width: 130 }}>
                        <BudgetInput
                          cents={budgetById.get(c.id) ?? 0}
                          onSave={(cents) =>
                            putBudget.mutate({
                              category_id: c.id,
                              amount_cents: cents,
                              valid_from: month,
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                <tr>
                  <td>
                    <b>Total</b>
                  </td>
                  <td className="num">
                    <b>{formatBRL(total(kind))}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <div className="card">
        Saldo líquido projetado:{" "}
        <b style={{ color: saldoProjetado >= 0 ? "var(--good)" : "var(--critical)" }}>
          {formatBRL(saldoProjetado)}
        </b>
      </div>
      <div className="card">
        <BudgetHistory month={month} />
      </div>
    </>
  );
}

function BudgetInput({ cents, onSave }: { cents: number; onSave: (c: number) => void }) {
  const toText = (c: number) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");
  const [text, setText] = useState(toText(cents));
  useEffect(() => setText(toText(cents)), [cents]);
  const commit = () => {
    const parsed = text.trim() === "" ? 0 : parseBRL(text);
    if (parsed !== null && parsed >= 0 && parsed !== cents) onSave(parsed);
  };
  return (
    <input
      style={{ width: 110, textAlign: "right" }}
      value={text}
      placeholder="0,00"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function BudgetHistory({ month }: { month: string }) {
  const months = lastNMonths(month, 6);
  const results = useSummaries(months);
  return (
    <>
      <h3>Histórico — real vs. orçado</h3>
      <table>
        <thead>
          <tr>
            <th>Mês</th>
            <th className="num">Entradas (real / orç.)</th>
            <th className="num">Saídas (real / orç.)</th>
            <th className="num">Saldo (real / orç.)</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m, i) => {
            const s = results[i].data;
            return (
              <tr key={m}>
                <td>{monthLabel(m)}</td>
                <td className="num">
                  {s ? `${formatBRL(s.entradas.real)} / ${formatBRL(s.entradas.orcado)}` : "…"}
                </td>
                <td className="num">
                  {s ? `${formatBRL(s.saidas.real)} / ${formatBRL(s.saidas.orcado)}` : "…"}
                </td>
                <td className="num">
                  {s ? `${formatBRL(s.saldo.real)} / ${formatBRL(s.saldo.orcado)}` : "…"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
