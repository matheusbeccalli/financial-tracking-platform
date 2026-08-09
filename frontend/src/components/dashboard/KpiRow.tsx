import { useSummary } from "../../api/hooks";
import { formatBRL } from "../../lib/money";
import StatTile from "../StatTile";

export default function KpiRow({ month }: { month: string }) {
  const { data: s, isLoading, error } = useSummary(month);
  if (isLoading) return <p className="muted">Carregando…</p>;
  if (error || !s)
    return <p className="error">Erro ao carregar resumo: {(error as Error)?.message}</p>;
  const acima = s.ritmo !== null && s.ritmo > 0;
  return (
    <div className="tiles">
      <StatTile
        label="Entradas"
        value={formatBRL(s.entradas.real)}
        sub={`orçado ${formatBRL(s.entradas.orcado)}`}
      />
      <StatTile
        label="Saídas"
        value={formatBRL(s.saidas.real)}
        sub={`orçado ${formatBRL(s.saidas.orcado)}`}
      />
      <StatTile
        label="Investido"
        value={formatBRL(s.investimentos.real)}
        sub={
          s.investimentos.real < 0
            ? "resgate líquido no mês"
            : s.investimentos.orcado > 0
              ? `meta ${formatBRL(s.investimentos.orcado)}`
              : "sem meta"
        }
        tone={
          s.investimentos.real < 0
            ? "bad"
            : s.investimentos.orcado > 0 && s.investimentos.real >= s.investimentos.orcado
              ? "good"
              : undefined
        }
      />
      <StatTile
        label="Saldo"
        value={formatBRL(s.saldo.real)}
        sub={`orçado ${formatBRL(s.saldo.orcado)}`}
        tone={s.saldo.real >= 0 ? "good" : "bad"}
      />
      <StatTile
        label="Ritmo das saídas"
        value={
          s.ritmo === null
            ? "—"
            : `${s.ritmo > 0 ? "+" : s.ritmo < 0 ? "−" : ""}${Math.abs(Math.round(s.ritmo))} pts`
        }
        sub={
          s.ritmo === null
            ? "sem orçamento"
            : `gastou ${Math.round((s.saidas.real / s.saidas.orcado) * 100)}% do orçado com ${Math.round((s.dias.decorridos / s.dias.no_mes) * 100)}% do mês corrido`
        }
        tone={acima ? "bad" : undefined}
      />
    </div>
  );
}
