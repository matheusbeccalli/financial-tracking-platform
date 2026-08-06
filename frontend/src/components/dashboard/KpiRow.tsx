import { useSummary } from "../../api/hooks";
import { formatBRL } from "../../lib/money";
import StatTile from "../StatTile";

export default function KpiRow({ month }: { month: string }) {
  const { data: s, isLoading, error } = useSummary(month);
  if (isLoading) return <p className="muted">Carregando…</p>;
  if (error || !s)
    return <p className="error">Erro ao carregar resumo: {(error as Error)?.message}</p>;
  const acima = s.ritmo !== null && s.ritmo > 1;
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
        label="Saldo"
        value={formatBRL(s.saldo.real)}
        sub={`orçado ${formatBRL(s.saldo.orcado)}`}
        tone={s.saldo.real >= 0 ? "good" : "bad"}
      />
      <StatTile
        label="Ritmo das saídas"
        value={s.ritmo === null ? "—" : `${Math.round(s.ritmo * 100)}%`}
        sub={s.ritmo === null ? "sem orçamento" : acima ? "acima do sustentável" : "dentro do mês"}
        tone={acima ? "bad" : undefined}
      />
    </div>
  );
}
