import type { Summary } from "../../api/types";
import { notRealized } from "../../lib/dashboard";
import { monthName } from "../../lib/months";
import Money from "../Money";
import Pill from "../Pill";

export default function NotRealizedCard({ s, month }: { s: Summary; month: string }) {
  const v = notRealized(s.categorias, s.saidas.real, s.entradas.orcado);
  if (v.categorias === 0) return null;

  return (
    <div className="card">
      <div className="notreal-head">
        <h2>Orçado, ainda não realizado</h2>
        <Pill dashed tone="muted">
          previsto
        </Pill>
      </div>
      <div className="sub">
        {v.categorias} categorias com orçamento e nenhum lançamento em {monthName(month)}
      </div>
      <div className="notreal-total">
        <Money cents={v.total} />
      </div>

      <div className="notreal-rows">
        {v.rows.map((c) => (
          <div key={c.id} className="notreal-row">
            <span>{c.nome}</span>
            <span className="notreal-row-value">
              <span className="notreal-dash" />
              <Money cents={c.orcado} tone="ink-2" />
            </span>
          </div>
        ))}
        {v.restoCount > 0 && (
          <div className="notreal-row tone-muted">
            <span>+ {v.restoCount} categorias menores</span>
            <Money cents={v.restoTotal} tone="muted" />
          </div>
        )}
      </div>

      <div className="notreal-foot">
        <div>
          <span className="tone-muted">Já realizado</span>
          <Money cents={-s.saidas.real} tone="ink-2" />
        </div>
        <div>
          <span className="tone-muted">Previsto acima</span>
          <Money cents={-v.total} tone="ink-2" />
        </div>
        <div>
          <span className="tone-muted">Entradas orçadas</span>
          <Money cents={s.entradas.orcado} alwaysSign tone="accent" />
        </div>
        <div className="notreal-foot-total">
          <span>Saldo se o orçado se cumprir</span>
          <Money
            cents={v.saldoProjetado}
            alwaysSign
            tone={v.saldoProjetado >= 0 ? "accent" : "over"}
          />
        </div>
      </div>
      <p className="note">
        Tudo aqui vem do orçamento do mês — não é previsão. O traço pontilhado marca o que
        ainda não tem lançamento.
      </p>
    </div>
  );
}
