import type { ImportBatch } from "../api/types";
import { dayMonth } from "./months";
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

/** "2026-08-07T15:27:33" → "07/08 15:27", para a coluna Quando do histórico. */
export function whenLabel(iso: string): string {
  return `${dayMonth(iso)} ${iso.slice(11, 16)}`;
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
