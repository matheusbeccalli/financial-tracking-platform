import type { TxSummary } from "../../lib/txTable";
import Money from "../Money";

export default function TotalsStrip({ s }: { s: TxSummary }) {
  return (
    <section className="tx-totals">
      <div>
        <span className="label">Entradas</span>
        <Money cents={s.entradas} tone="accent" />
      </div>
      <div>
        <span className="label">Saídas</span>
        <Money cents={-s.saidas} />
      </div>
      <div>
        <span className="label">Saldo</span>
        <Money cents={s.saldo} tone={s.saldo < 0 ? "over" : "accent"} />
      </div>
    </section>
  );
}
