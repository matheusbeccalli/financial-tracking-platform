import { useSummary } from "../../api/hooks";
import type { CatLine } from "../../api/types";
import { investBarView } from "../../lib/investBar";
import { formatBRL } from "../../lib/money";

export default function CategoryBars({ month }: { month: string }) {
  const { data: s } = useSummary(month);
  if (!s) return null;
  const saidas = s.categorias.filter((c) => c.kind === "saida");
  const entradas = s.categorias.filter((c) => c.kind === "entrada");
  const investimentos = s.categorias.filter((c) => c.kind === "investimento");
  return (
    <>
      <h3>Real vs. orçado — saídas</h3>
      {saidas.length === 0 && (
        <p className="muted">Sem lançamentos nem orçamento neste mês.</p>
      )}
      {saidas.map((c) => (
        <CatBar key={c.id} line={c} />
      ))}
      {entradas.length > 0 && (
        <>
          <h3 style={{ marginTop: 14 }}>Entradas</h3>
          {entradas.map((c) => (
            <CatBar key={c.id} line={c} />
          ))}
        </>
      )}
      {investimentos.length > 0 && (
        <>
          <h3 style={{ marginTop: 14 }}>Investimentos</h3>
          {investimentos.map((c) => (
            <InvestBar key={c.id} line={c} />
          ))}
        </>
      )}
    </>
  );
}

function CatBar({ line }: { line: CatLine }) {
  const over = line.real > line.orcado;
  const pct =
    line.orcado > 0
      ? Math.min(100, (line.real / line.orcado) * 100)
      : line.real > 0
        ? 100
        : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
        <span>
          {line.nome}
          {over && (
            <span className="badge" style={{ color: "var(--critical)", marginLeft: 6 }}>
              ▲ acima
            </span>
          )}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatBRL(line.real)} / {line.orcado > 0 ? formatBRL(line.orcado) : "—"}
        </span>
      </div>
      <div className="bar-track">
        <div className={`bar-fill${over ? " over" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function InvestBar({ line }: { line: CatLine }) {
  const v = investBarView(line.real, line.orcado);
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
        <span>
          {line.nome}
          {v.met && (
            <span className="badge" style={{ color: "var(--good)", marginLeft: 6 }}>
              ✓ meta
            </span>
          )}
        </span>
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            color: v.negative ? "var(--critical)" : undefined,
          }}
        >
          {v.negative
            ? `${formatBRL(line.real)} · resgate líquido`
            : `${formatBRL(line.real)} / ${line.orcado > 0 ? formatBRL(line.orcado) : "—"}`}
        </span>
      </div>
      <div className="bar-track">
        <div
          className="bar-fill"
          style={{ width: `${v.pct}%`, ...(v.met ? { background: "var(--good)" } : {}) }}
        />
      </div>
    </div>
  );
}
