import type { InstallmentSeries } from "../../api/types";
import { monthLabel } from "../../lib/months";
import Money from "../Money";

export default function SeriesTable({ series }: { series: InstallmentSeries[] }) {
  return (
    <section className="card">
      <h2>Compras parceladas ativas</h2>
      <div className="inst-scroll">
        <table className="inst-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Conta</th>
              <th>Categoria</th>
              <th className="num">Parcela</th>
              <th className="num">Valor mensal</th>
              <th className="num">Término</th>
              <th className="num">Restante</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.tx_id}>
                <td title={s.descricao}>{s.descricao}</td>
                <td className="muted">{s.conta}</td>
                <td className="muted">{s.categoria_nome ?? "Sem categoria"}</td>
                <td className="num">
                  <span className="tx-parcela mono">
                    {s.numero}/{s.total}
                  </span>
                </td>
                <td className="num">
                  <Money cents={s.valor} />
                </td>
                <td className="num mono">{monthLabel(s.termina_em)}</td>
                <td className="num">
                  <Money cents={s.restante} zeroDash />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
