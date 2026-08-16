import { ApiError } from "../api/client";
import type { ImportBatch } from "../api/types";
import { pctOf } from "./pct";

/** "Bradesco_09082026.ofx" → "OFX". Sem extensão, "?" — o badge nunca fica vazio. */
export function fileBadge(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "?";
  return filename.slice(dot + 1).toUpperCase();
}

/** Tamanho de arquivo como o design mostra: "142 KB", "1,5 MB". Nunca "0 KB". */
export function formatKB(bytes: number): string {
  if (bytes >= 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * "2026-08-07T15:27:33+00:00" → "07/08 12:27" (fuso local), para a coluna Quando.
 * O backend emite `imported_at` com offset UTC explícito; o fallback de colar um
 * "Z" cobre strings naive de versões antigas da API.
 */
export function whenLabel(iso: string): string {
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Cadência do polling de classificação. Erro transiente (rede, 5xx) NÃO para —
 * parar congelaria o card em "classificando…" e perderia a invalidação final.
 * 404 para de vez: o lote foi desfeito e não volta.
 */
export function pollInterval(status: string | undefined, error: unknown): number | false {
  if (error instanceof ApiError && error.status === 404) return false;
  return status === "running" ? 1500 : false;
}

export function batchTotals(batches: ImportBatch[]): { novas: number; dup: number } {
  return batches.reduce(
    (acc, b) => ({ novas: acc.novas + b.new_count, dup: acc.dup + b.dup_count }),
    { novas: 0, dup: 0 }
  );
}

/**
 * Larguras da barra de proporção do histórico. Lote sem transação nenhuma
 * (não deveria existir) cai na barra cinza em vez de dividir por zero.
 */
export function dupSplit(novas: number, dup: number): { novasPct: number; dupPct: number } {
  const total = novas + dup;
  if (total === 0) return { novasPct: 0, dupPct: 100 };
  const novasPct = pctOf(novas, total);
  return { novasPct, dupPct: 100 - novasPct };
}
