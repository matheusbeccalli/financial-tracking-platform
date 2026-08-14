import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { useClassification } from "../../api/hooks";
import type { ImportResult } from "../../api/types";
import type { Tone } from "../../lib/tone";
import { describeProgress } from "../ClassificationStatus";

/**
 * Resultado de um arquivo importado. Novas/Duplicadas são imediatas; as métricas de
 * classificação chegam pelo polling — enquanto roda, a linha de progresso ocupa o
 * lugar delas.
 */
export default function ResultCard({
  r,
  onClose,
}: {
  r: ImportResult;
  onClose: () => void;
}) {
  const { data: p } = useClassification(r.batch_id, r.classification);
  const queryClient = useQueryClient();
  const status = p.status;
  useEffect(() => {
    // terminou (ou falhou): dashboard/transações precisam refletir as categorias
    if (status !== "running") {
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== "classification",
      });
    }
  }, [status, queryClient]);

  return (
    <div className="imp-result">
      <div className="imp-result-head">
        <span>Importado</span>
        <button type="button" className="imp-result-close" onClick={onClose}>
          fechar
        </button>
      </div>
      <div className="imp-result-file mono">{r.filename}</div>
      <div className="imp-result-grid">
        <Metric label="Novas" v={r.new_count} tone="accent" />
        <Metric label="Duplicadas" v={r.dup_count} tone="muted" />
        {status === "done" ? (
          <>
            <Metric label="Por regra" v={p.counts.regra} divider />
            <Metric label="Pelo LLM" v={p.counts.llm} />
            <Metric
              label="Pendentes"
              v={p.counts.pendente}
              tone={p.counts.pendente > 0 ? "warn" : "muted"}
            />
          </>
        ) : (
          <div className="imp-result-progress note">{describeProgress(p)}</div>
        )}
      </div>
      {status === "done" && p.counts.pendente > 0 && (
        <Link className="imp-result-link" to="/transacoes">
          Revisar as {p.counts.pendente} pendentes em Transações →
        </Link>
      )}
    </div>
  );
}

function Metric({
  label,
  v,
  tone,
  divider = false,
}: {
  label: string;
  v: number;
  tone?: Tone;
  divider?: boolean;
}) {
  return (
    <div className={divider ? "imp-metric imp-metric--divider" : "imp-metric"}>
      <div className="label">{label}</div>
      <div className={tone ? `mono imp-metric-v tone-${tone}` : "mono imp-metric-v"}>{v}</div>
    </div>
  );
}
