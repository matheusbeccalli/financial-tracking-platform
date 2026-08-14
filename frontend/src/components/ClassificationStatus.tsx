import { useClassification } from "../api/hooks";
import type { ClassificationProgress } from "../api/types";

export function describeProgress(p: ClassificationProgress): string {
  if (p.status === "running") return `classificando ${p.done}/${p.total}…`;
  if (p.status === "error")
    return 'classificação falhou — use "Reclassificar pendentes"';
  if (p.status === "interrupted")
    return 'classificação interrompida — use "Reclassificar pendentes"';
  return `classificadas: ${p.counts.regra} por regra, ${p.counts.llm} pelo LLM, ${p.counts.pendente} pendentes`;
}

// Compat: a página antiga ainda renderiza este componente; sai na Task 4.
export default function ClassificationStatus({
  batchId,
  initial,
}: {
  batchId: number;
  initial: ClassificationProgress;
}) {
  const { data } = useClassification(batchId, initial);
  return <span>{describeProgress(data)}</span>;
}
