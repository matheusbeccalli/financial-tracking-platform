# Redesign — Plano 05: Importar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a tela de Importar conforme o protótipo `Importar.dc.html` do bundle de handoff (local, não versionado) — card "Novo upload" com fluxo numerado (chips de conta → dropzone com drag & drop → lista staged → card de resultado com 5 métricas), card "Pendentes de classificação" com botão warn e resultado em linhas, e histórico com badge de tipo, "N novas · M dup.", barra de proporção e Desfazer.

**Architecture:** Sem backend novo. A lógica de upload sequencial (um POST por arquivo, para no primeiro erro) sai da página e vai para `components/imports/UploadCard.tsx`, agora com estado `File[]` staged (dropzone + input escondido) em vez de `<input type=file>` visível. O card de resultado (`ResultCard`) absorve o polling do `useClassification` e a invalidação-ao-terminar que hoje vivem em `ClassificationStatus.tsx` — o componente default morre e o arquivo passa a exportar só o helper puro `describeProgress` (de quebra resolve o warning de fast-refresh). Formatações puras novas (badge de extensão, KB, data/hora curta, totais e proporção do histórico) vão para `lib/imports.ts` com vitest.

**Tech Stack:** React 19 + TypeScript, TanStack Query, react-router (Link), vitest, CSS puro com os tokens e primitivos dos planos 00–04.

**Spec:** `docs/superpowers/specs/2026-08-09-frontend-redesign-design.md`

**Baseline antes de começar:** frontend 121 testes, backend 110 testes, ambos verdes, em `747c184`.

### Decisões tomadas para este plano

1. **Um card de resultado por arquivo importado.** O protótipo mostra um; a página envia N arquivos e cada um tem a própria classificação em background — os cards empilham, cada um com "fechar".
2. **As 3 métricas de classificação (Por regra / Pelo LLM / Pendentes) só existem quando a classificação termina.** Enquanto roda, o card mostra Novas/Duplicadas (imediatas) + a linha de progresso do `describeProgress` ("classificando 34/142…"); erro/interrompida mostram o aviso apontando para "Reclassificar pendentes".
3. **Falha no meio do lote mantém staged o arquivo que falhou e os seguintes** (hoje o input é esvaziado inteiro). Os que entraram saem da lista; retry é um clique.
4. **Drop filtra por extensão** (`.ofx`/`.csv`, case-insensitive) — arrastar um PDF é ignorado silenciosamente; o picker já usa `accept`.
5. **Sem conta pré-selecionada.** Importar na conta errada dói (mesmo com Desfazer); a escolha é explícita, e os chips a tornam um clique.
6. **Link "Revisar as N pendentes" só com N > 0**; tone do metric Pendentes é warn só com N > 0. "Conferir o que o LLM decidiu →" só com llm > 0.
7. **Largura da página limitada a 1180px** como o `main` do protótipo — a tela é de formulário, não de tabela densa.

---

### Task 1: Módulo puro `lib/imports.ts` (TDD)

**Files:**
- Create: `frontend/src/lib/imports.ts`
- Test: `frontend/src/lib/imports.test.ts`

- [ ] **Step 1.1: Escrever os testes**

Create `frontend/src/lib/imports.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { ImportBatch } from "../api/types";
import { batchTotals, dupSplit, fileBadge, formatKB, whenLabel } from "./imports";

const batch = (id: number, new_count: number, dup_count: number): ImportBatch => ({
  id,
  filename: `f${id}.ofx`,
  source: "ofx",
  imported_at: "2026-08-07T15:27:33",
  new_count,
  dup_count,
});

describe("fileBadge", () => {
  it("extensão em maiúsculas", () => {
    expect(fileBadge("Bradesco_09082026_101204.ofx")).toBe("OFX");
    expect(fileBadge("Bradesco_982026_094410 AM.csv")).toBe("CSV");
    expect(fileBadge("EXTRATO.OFX")).toBe("OFX");
  });

  it("sem extensão vira interrogação", () => {
    expect(fileBadge("extrato")).toBe("?");
  });
});

describe("formatKB", () => {
  it("KB inteiro, mínimo 1", () => {
    expect(formatKB(145_408)).toBe("142 KB");
    expect(formatKB(512)).toBe("1 KB");
  });

  it("acima de 1 MB usa MB com uma casa", () => {
    expect(formatKB(1_572_864)).toBe("1,5 MB");
  });
});

describe("whenLabel", () => {
  it("dd/mm hh:mm", () => {
    expect(whenLabel("2026-08-07T15:27:33")).toBe("07/08 15:27");
  });
});

describe("batchTotals", () => {
  it("soma novas e duplicadas de todos os lotes", () => {
    const t = batchTotals([batch(1, 178, 0), batch(2, 76, 2), batch(3, 0, 93)]);
    expect(t.novas).toBe(254);
    expect(t.dup).toBe(95);
  });

  it("lista vazia zera", () => {
    expect(batchTotals([])).toEqual({ novas: 0, dup: 0 });
  });
});

describe("dupSplit", () => {
  it("divide a barra pela proporção de novas", () => {
    const s = dupSplit(57, 2);
    expect(s.novasPct).toBeCloseTo(96.61, 1);
    expect(s.dupPct).toBeCloseTo(3.39, 1);
  });

  it("tudo novo é barra cheia; tudo duplicado é barra cinza", () => {
    expect(dupSplit(93, 0)).toEqual({ novasPct: 100, dupPct: 0 });
    expect(dupSplit(0, 93)).toEqual({ novasPct: 0, dupPct: 100 });
  });

  it("lote vazio cai no cinza, sem NaN", () => {
    expect(dupSplit(0, 0)).toEqual({ novasPct: 0, dupPct: 100 });
  });
});
```

- [ ] **Step 1.2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/imports.test.ts`
Expected: FAIL — `Cannot find module './imports'`.

- [ ] **Step 1.3: Implementar**

Create `frontend/src/lib/imports.ts`:

```ts
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
```

- [ ] **Step 1.4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/lib/imports.test.ts && npx tsc --noEmit`
Expected: 10 testes PASS; tsc limpo.

- [ ] **Step 1.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/lib/imports.ts frontend/src/lib/imports.test.ts
git commit -m "feat(ui): imports formatting module"
```

---

### Task 2: `UploadCard` + `ResultCard`; `ClassificationStatus` vira helper puro

**Files:**
- Create: `frontend/src/components/imports/UploadCard.tsx`
- Create: `frontend/src/components/imports/ResultCard.tsx`
- Modify: `frontend/src/components/ClassificationStatus.tsx`
- Modify: `frontend/src/styles/pages.css`

- [ ] **Step 2.1: Reduzir `ClassificationStatus.tsx` ao helper**

Substituir todo o conteúdo de `frontend/src/components/ClassificationStatus.tsx` por:

```tsx
import type { ClassificationProgress } from "../api/types";

export function describeProgress(p: ClassificationProgress): string {
  if (p.status === "running") return `classificando ${p.done}/${p.total}…`;
  if (p.status === "error")
    return 'classificação falhou — use "Reclassificar pendentes"';
  if (p.status === "interrupted")
    return 'classificação interrompida — use "Reclassificar pendentes"';
  return `classificadas: ${p.counts.regra} por regra, ${p.counts.llm} pelo LLM, ${p.counts.pendente} pendentes`;
}
```

> O componente default (polling + invalidação) muda para o `ResultCard` no Step 2.3.
> `ClassificationStatus.test.ts` importa só `describeProgress` e continua passando.
> A página antiga ainda renderiza `<ClassificationStatus>` e só é reescrita na Task 4 —
> por isso este step não roda tsc sozinho: o Step 2.2 cria um shim temporário.

- [ ] **Step 2.2: Shim temporário para a página antiga**

A página atual (`pages/Imports.tsx`) usa `<ClassificationStatus batchId initial />`. Para
cada task continuar verde sem reescrever a página agora, acrescentar **ao final** de
`frontend/src/components/ClassificationStatus.tsx` (será removido na Task 4 junto com a
página antiga):

```tsx
import { useClassification } from "../api/hooks";

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
```

(O import de `useClassification` vai para o topo do arquivo, junto do import de tipos.
A invalidação-ao-terminar que o componente antigo fazia passa a viver só no `ResultCard`;
durante o intervalo entre as Tasks 2 e 4 a página antiga perde essa invalidação — 
aceitável, ninguém vai importar arquivos nesse meio-tempo.)

- [ ] **Step 2.3: `ResultCard`**

Create `frontend/src/components/imports/ResultCard.tsx`:

```tsx
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
```

- [ ] **Step 2.4: `UploadCard`**

Create `frontend/src/components/imports/UploadCard.tsx`:

```tsx
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { Account, ImportResult } from "../../api/types";
import { fileBadge, formatKB } from "../../lib/imports";
import Chip from "../Chip";
import ResultCard from "./ResultCard";

const EXT_OK = /\.(ofx|csv)$/i;

export default function UploadCard({ accounts }: { accounts: Account[] }) {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [staged, setStaged] = useState<File[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const ok = Array.from(list).filter((f) => EXT_OK.test(f.name));
    if (ok.length) setStaged((prev) => [...prev, ...ok]);
  };

  async function run() {
    if (!staged.length || accountId === null || busy) return;
    setBusy(true);
    setError(null);
    const done: ImportResult[] = [];
    for (const file of staged) {
      const form = new FormData();
      form.append("account_id", String(accountId));
      form.append("file", file);
      try {
        done.push(await api<ImportResult>("/imports", { method: "POST", body: form }));
      } catch (e) {
        setError(
          `${file.name}: ${(e as Error).message} — arquivos seguintes não foram enviados`
        );
        break;
      }
    }
    setResults(done);
    // Quem entrou sai da fila; quem falhou (e os seguintes) fica para o retry.
    setStaged((prev) => prev.slice(done.length));
    setBusy(false);
    queryClient.invalidateQueries();
  }

  const conta = accounts.find((a) => a.id === accountId);

  return (
    <div className="card imp-upload">
      <div className="imp-head">
        <h2>Novo upload</h2>
        <div className="imp-exts mono">
          <span>.OFX</span>
          <span>.CSV</span>
        </div>
      </div>

      <div className="label imp-step">1. Para qual conta</div>
      <div className="imp-chips">
        {accounts.map((a) => (
          <Chip key={a.id} active={a.id === accountId} onClick={() => setAccountId(a.id)}>
            {a.name}{" "}
            <span className="imp-chip-kind">{a.kind === "cartao" ? "cartão" : a.kind}</span>
          </Chip>
        ))}
      </div>

      <div className="label imp-step">2. Os arquivos</div>
      <div
        className={`imp-drop${drag ? " is-drag" : ""}${staged.length ? " has-files" : ""}`}
        role="button"
        aria-label="Escolher arquivos de extrato"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <span className="imp-drop-icon" aria-hidden="true">
          ↓
        </span>
        <div className="imp-drop-title">Arraste os extratos aqui</div>
        <div className="imp-drop-sub">ou clique para escolher — vários de uma vez</div>
        <input
          ref={fileRef}
          type="file"
          accept=".ofx,.csv"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {staged.length > 0 && (
        <div className="imp-staged">
          {staged.map((f, i) => (
            <div key={`${f.name}-${i}`} className="imp-file">
              <span className="imp-badge mono">{fileBadge(f.name)}</span>
              <span className="imp-file-name">{f.name}</span>
              <span className="imp-file-size mono">{formatKB(f.size)}</span>
              <button
                type="button"
                className="imp-file-x"
                aria-label={`Remover ${f.name}`}
                onClick={() => setStaged(staged.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <div className="imp-run">
            <button
              type="button"
              className="primary"
              disabled={busy || accountId === null}
              onClick={run}
            >
              {busy
                ? "Importando…"
                : `Importar ${staged.length} ${staged.length === 1 ? "arquivo" : "arquivos"}`}
            </button>
            <span className="note">
              {conta ? `em ${conta.name} · ` : "escolha a conta · "}
              enviados na ordem, um a um
            </span>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {results.map((r) => (
        <ResultCard
          key={r.batch_id}
          r={r}
          onClose={() => setResults(results.filter((x) => x.batch_id !== r.batch_id))}
        />
      ))}

      <p className="note imp-foot">
        Pode reimportar períodos sobrepostos sem medo — duplicadas são descartadas pelo hash
        do lançamento. Se um arquivo falhar, os seguintes não são enviados.
      </p>
    </div>
  );
}
```

- [ ] **Step 2.5: CSS**

Ao final de `frontend/src/styles/pages.css`:

```css
/* ---------- Importar ---------- */
.imports-page {
  max-width: 1180px;
}

.imp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.imp-exts {
  display: flex;
  gap: 6px;
  font-size: 10.5px;
  color: var(--muted);
}

.imp-exts span {
  padding: 2px 7px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border-strong);
}

.imp-step {
  margin-top: 13px;
  margin-bottom: 8px;
}

.imp-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.imp-chip-kind {
  opacity: 0.65;
  font-size: 10.5px;
}

.imp-drop {
  border: 1.5px dashed var(--border-strong);
  border-radius: 11px;
  padding: 26px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  cursor: pointer;
}

.imp-drop:hover,
.imp-drop.is-drag {
  border-color: var(--focus);
  background: var(--tint-accent);
}

.imp-drop.has-files {
  border-color: var(--focus);
}

.imp-drop-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 1px solid var(--border-strong);
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 15px;
}

.imp-drop-title {
  font-size: 13.5px;
  font-weight: 500;
  margin-top: 11px;
}

.imp-drop-sub {
  font-size: 12px;
  color: var(--muted);
  margin-top: 3px;
}

.imp-staged {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.imp-file {
  display: flex;
  align-items: center;
  gap: 11px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-control);
  padding: 8px 11px;
}

.imp-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--track);
  color: var(--ink-2);
  flex: none;
}

.imp-file-name {
  flex: 1;
  font-size: 12.5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.imp-file-size {
  font-size: 11px;
  color: var(--muted);
}

.imp-file-x {
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  padding: 0 2px;
}

.imp-file-x:hover {
  color: var(--over);
}

.imp-run {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 5px;
}

.imp-result {
  margin-top: 12px;
  border: 1px solid var(--focus);
  background: var(--tint-accent);
  border-radius: 10px;
  padding: 13px 14px;
}

.imp-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12.5px;
  font-weight: 600;
}

.imp-result-close {
  border: 0;
  background: none;
  font-size: 11.5px;
  font-weight: 400;
  color: var(--muted);
  cursor: pointer;
  padding: 0;
}

.imp-result-close:hover {
  color: var(--ink);
}

.imp-result-file {
  font-size: 12px;
  color: var(--ink-2);
  margin-top: 7px;
}

.imp-result-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-top: 10px;
}

.imp-metric--divider {
  border-left: 1px solid var(--border-strong);
  padding-left: 12px;
}

.imp-metric-v {
  font-size: 16px;
  margin-top: 3px;
}

.imp-result-progress {
  grid-column: span 3;
  align-self: end;
}

.imp-result-link {
  display: inline-block;
  font-size: 12px;
  margin-top: 11px;
}

.imp-foot {
  margin-top: 13px;
  padding-top: 11px;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 2.6: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: tudo verde, 131 testes (121 + 10). Componentes novos ainda não usados.

- [ ] **Step 2.7: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/imports frontend/src/components/ClassificationStatus.tsx frontend/src/styles/pages.css
git commit -m "feat(ui): imports upload card with dropzone and per-file result card"
```

---

### Task 3: `ClassifyCard` + `HistoryCard`

**Files:**
- Create: `frontend/src/components/imports/ClassifyCard.tsx`
- Create: `frontend/src/components/imports/HistoryCard.tsx`
- Modify: `frontend/src/styles/pages.css`

- [ ] **Step 3.1: `ClassifyCard`**

Create `frontend/src/components/imports/ClassifyCard.tsx`:

```tsx
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
```

- [ ] **Step 3.2: `HistoryCard`**

Create `frontend/src/components/imports/HistoryCard.tsx`:

```tsx
import { useDeleteImport, useImports } from "../../api/hooks";
import { batchTotals, dupSplit, fileBadge, whenLabel } from "../../lib/imports";

export default function HistoryCard() {
  const { data: batches } = useImports();
  const deleteImport = useDeleteImport();
  const list = batches ?? [];
  const t = batchTotals(list);

  return (
    <section className="card">
      <div className="imp-hist-head">
        <h2>Histórico de importações</h2>
        {list.length > 0 && (
          <span className="mono imp-hist-totals">
            {t.novas} novas · {t.dup} duplicadas descartadas
          </span>
        )}
      </div>

      {list.length === 0 ? (
        <p className="muted">Nenhuma importação ainda.</p>
      ) : (
        <>
          <div className="imp-hist-row imp-hist-head-row">
            <div>Arquivo</div>
            <div>Quando</div>
            <div>Resultado</div>
            <div />
          </div>
          {list.map((b) => {
            const s = dupSplit(b.new_count, b.dup_count);
            return (
              <div key={b.id} className="imp-hist-row">
                <div className="imp-hist-file">
                  <span className="imp-badge mono">{fileBadge(b.filename)}</span>
                  <span className="imp-file-name">{b.filename}</span>
                </div>
                <div className="mono imp-hist-when">{whenLabel(b.imported_at)}</div>
                <div>
                  <div className="mono imp-hist-counts">
                    <span className={b.new_count > 0 ? "tone-accent" : "tone-muted"}>
                      {b.new_count}
                    </span>
                    <span className="tone-muted">
                      {" "}
                      novas{b.dup_count > 0 ? ` · ${b.dup_count} dup.` : ""}
                    </span>
                  </div>
                  <div className="imp-hist-bar" aria-hidden="true">
                    <span className="is-new" style={{ width: `${s.novasPct}%` }} />
                    <span className="is-dup" style={{ width: `${s.dupPct}%` }} />
                  </div>
                </div>
                <div className="imp-hist-undo">
                  <button
                    type="button"
                    onClick={() =>
                      window.confirm(
                        `Desfazer a importação de ${b.filename}? As ${b.new_count} transações dela serão removidas.`
                      ) && deleteImport.mutate(b.id)
                    }
                  >
                    Desfazer
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      <p className="note imp-hist-foot">
        Desfazer pede confirmação e remove as transações daquele arquivo.
      </p>
    </section>
  );
}
```

- [ ] **Step 3.3: CSS**

Ao final da seção "Importar" de `frontend/src/styles/pages.css`:

```css
.imp-classify-desc {
  margin-top: 5px;
}

.imp-classify-btn {
  width: 100%;
  margin-top: 13px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  padding: 9px;
  border-radius: var(--r-control);
  cursor: pointer;
  border: 1px solid var(--warn);
  background: var(--tint-warn);
  color: var(--warn);
}

.imp-classify-btn:disabled {
  color: var(--muted);
  cursor: default;
}

.imp-classify-result {
  margin-top: 13px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12.5px;
}

.imp-classify-result > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.imp-classify-result a {
  font-size: 12px;
  margin-top: 2px;
}

.imp-classify-idle {
  margin-top: 13px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.imp-hist-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.imp-hist-totals {
  font-size: 11.5px;
  color: var(--muted);
}

.imp-hist-row {
  display: grid;
  grid-template-columns: 1fr 116px 190px 96px;
  gap: 14px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--divider);
}

.imp-hist-head-row {
  padding: 12px 0 7px;
  font-size: 10px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}

.imp-hist-file {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  font-size: 12.5px;
}

.imp-hist-when {
  font-size: 11.5px;
  color: var(--muted);
}

.imp-hist-counts {
  font-size: 13px;
  white-space: nowrap;
}

.imp-hist-counts .tone-muted {
  font-size: 11px;
}

.imp-hist-bar {
  margin-top: 5px;
  height: 3px;
  border-radius: var(--r-pill);
  background: var(--track);
  display: flex;
  gap: 1px;
  overflow: hidden;
}

.imp-hist-bar .is-new {
  background: var(--accent);
}

.imp-hist-bar .is-dup {
  background: var(--muted);
  opacity: 0.55;
}

.imp-hist-undo {
  text-align: right;
}

.imp-hist-undo button {
  font: inherit;
  font-size: 11.5px;
  padding: 5px 11px;
  border-radius: 7px;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.imp-hist-undo button:hover {
  color: var(--over);
  border-color: var(--over);
}

.imp-hist-foot {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 11px;
}
```

- [ ] **Step 3.4: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: tudo verde (131 testes; componentes ainda não usados).

- [ ] **Step 3.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/imports frontend/src/styles/pages.css
git commit -m "feat(ui): imports classify and history cards"
```

---

### Task 4: Reescrita da página e verificação final

**Files:**
- Modify: `frontend/src/pages/Imports.tsx` (reescrita)
- Modify: `frontend/src/components/ClassificationStatus.tsx` (remover o shim)
- Modify: `frontend/src/styles/pages.css` (grid da página)

- [ ] **Step 4.1: Reescrever a página**

Substituir todo o conteúdo de `frontend/src/pages/Imports.tsx` por:

```tsx
import { useAccounts } from "../api/hooks";
import ClassifyCard from "../components/imports/ClassifyCard";
import HistoryCard from "../components/imports/HistoryCard";
import UploadCard from "../components/imports/UploadCard";
import PageHeader from "../components/PageHeader";

export default function Imports() {
  const { data: accounts } = useAccounts();

  return (
    <div className="imports-page">
      <PageHeader eyebrow="Importar" title="Extratos" />
      <section className="imp-grid">
        <UploadCard accounts={accounts ?? []} />
        <ClassifyCard />
      </section>
      <HistoryCard />
    </div>
  );
}
```

- [ ] **Step 4.2: Remover o shim do `ClassificationStatus`**

Em `frontend/src/components/ClassificationStatus.tsx`, apagar o componente default
`ClassificationStatus` (o shim do Step 2.2), o comentário "Compat:" e o import de
`useClassification` — o arquivo fica só com o import de tipos e `describeProgress`.

- [ ] **Step 4.3: CSS do grid**

Ao final da seção "Importar" de `frontend/src/styles/pages.css`:

```css
.imp-grid {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: var(--gap-section);
  align-items: start;
  margin-bottom: var(--gap-section);
}

.imp-grid .card {
  margin-bottom: 0;
}

@media (max-width: 900px) {
  .imp-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4.4: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint && npm run build`
Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: frontend 131 testes PASS, build ok; backend `110 passed` (intocado).

> `npm run build` não é opcional: o app é acessado em `localhost:8000`, onde o FastAPI
> serve `frontend/dist`.

- [ ] **Step 4.5: Verificação visual (skill webapp-testing)**

Em `http://localhost:5173/#/importar` (vite dev; **nunca** subir servidor de teste na
porta 8000 — é a porta do app real):

1. **Header:** eyebrow "Importar", h1 "Extratos"; grid 1.35fr/1fr com os dois cards.
2. **Novo upload:** pills .OFX/.CSV no canto; chips das contas com o kind em legenda;
   clicar seleciona (accent); dropzone tracejada com hover/drag accent.
3. **Staged:** escolher arquivos via picker (Playwright `set_input_files` no input
   escondido) — linha com badge, nome com ellipsis, tamanho "N KB", × remove; botão
   "Importar N arquivos" desabilitado sem conta; nota "em <conta> · enviados na ordem".
4. **Import real e reversível:** criar um OFX sintético mínimo com datas de 2020 (não
   contamina os meses em uso), importar na conta corrente, conferir o card "Importado"
   (Novas em teal, classificação concluindo, link de pendentes se houver) e o histórico
   ganhando a linha nova com barra; **Desfazer** a importação em seguida e confirmar que
   a linha some e as transações de 2020 não existem em Transações.
5. **Pendentes de classificação:** botão warn; clicar roda (dados reais: deve voltar
   0/0/0 rápido se não há pendências) e o resultado aparece em linhas.
6. **Histórico:** totais no cabeçalho ("N novas · M duplicadas descartadas"), badges,
   "Quando" em dd/mm hh:mm, barra proporcional (lotes só-duplicata em cinza), botão
   Desfazer com hover vermelho.
7. Screenshot em dark e em light; console sem erros.

- [ ] **Step 4.6: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/pages/Imports.tsx frontend/src/components/ClassificationStatus.tsx frontend/src/styles/pages.css
git commit -m "feat(ui): redesigned imports page"
```

- [ ] **Step 4.7: Revisão de código**

Usar a skill code-review sobre o conjunto de commits deste plano (preferência do usuário:
sem revisor por task, uma revisão ao final). Aplicar o que for real, commitar como
`fix(ui): address review findings in the imports redesign`.
