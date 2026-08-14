import { Link } from "react-router-dom";

import { useClassifyPending } from "../../api/hooks";
import type { ClassifiedCounts } from "../../api/types";

export default function ClassifyCard() {
  const classify = useClassifyPending();
  const counts = classify.data as ClassifiedCounts | undefined;

  return (
    <div className="card">
      <h2>Pendentes de classificação</h2>
      <p className="note imp-classify-desc">
        Roda regras e LLM em tudo que ficou sem categoria — inclusive lançamentos de
        importações antigas.
      </p>
      <button
        type="button"
        className="imp-classify-btn"
        disabled={classify.isPending}
        onClick={() => classify.mutate(undefined)}
      >
        {classify.isPending
          ? "Classificando…"
          : counts
            ? "Rodar de novo"
            : "Reclassificar pendentes"}
      </button>

      {counts ? (
        <div className="imp-classify-result">
          <div>
            <span className="tone-muted">Por regra</span>
            <span className="mono">{counts.regra}</span>
          </div>
          <div>
            <span className="tone-muted">Pelo LLM</span>
            <span className="mono">{counts.llm}</span>
          </div>
          <div>
            <span className="tone-muted">Continuam pendentes</span>
            <span className={counts.pendente > 0 ? "mono tone-warn" : "mono"}>
              {counts.pendente}
            </span>
          </div>
          {counts.llm > 0 && <Link to="/transacoes">Conferir o que o LLM decidiu →</Link>}
        </div>
      ) : (
        <p className="note imp-classify-idle">
          O resultado aparece aqui: quantas foram por regra, quantas pelo LLM e quantas
          continuam pendentes.
        </p>
      )}
    </div>
  );
}
