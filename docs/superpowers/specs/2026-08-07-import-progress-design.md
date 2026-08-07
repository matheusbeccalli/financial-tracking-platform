# Progresso de importação/classificação em background — Design

**Data:** 2026-08-07
**Status:** aprovado

## Problema

`POST /api/imports` é `async def` mas executa trabalho bloqueante (3+ chamadas
LLM síncronas de ~24s cada com Sonnet 5) direto no event loop: o backend
inteiro congela por 1–2 min durante um import, sem nenhum feedback ao usuário.
Diagnóstico completo em 2026-08-07 (import real de 142 transações reproduziu o
congelamento; nenhum loop infinito existia). Agravante: o cliente Anthropic é
criado sem timeout (default do SDK ~10 min por chamada, com retries).

## Objetivo

1. O app nunca congela durante import/classificação.
2. `POST /api/imports` responde em ~1s com novas/duplicadas já persistidas.
3. A classificação LLM roda em background com progresso consultável
   ("classificando X de Y"), commitando por lote.

## Decisões

- **Formato:** classificação em background + polling (escolhido pelo usuário
  entre background+polling, spinner simples e SSE).
- **Estado do job em memória** (`dict` por `batch_id`): app single-user local;
  contagens sempre derivadas do banco. Reinício do servidor no meio →
  status `interrupted`, recuperável pelo botão "Reclassificar pendentes".
- **Commit por lote de 50**: progresso real e à prova de queda.

## Backend

### `app/services/classifier.py` (refatorado)

`classify_new` é decomposto em partes reutilizáveis (comportamento do
`/classify/pending` não muda):

- `apply_rules(session, txs) -> tuple[int, list[Transaction]]` — aplica regras
  (rápido, só banco); retorna `(n_regra, pendentes)`.
- `llm_context(session) -> tuple[dict, list]` — `(by_name, examples)` de hoje.
- `classify_chunk(session, chunk, llm, by_name, examples) -> tuple[int, int]`
  — uma chamada LLM para até `LLM_BATCH_SIZE` itens; retorna `(n_llm, n_pend)`.
- `classify_new(session, txs, llm)` — reimplementada como
  `apply_rules` + loop de `classify_chunk` (sem commit, como hoje).

### `app/services/classify_job.py` (novo)

- `JOBS: dict[int, str]` — `batch_id → "running" | "done" | "error"`.
- `run_classification(batch_id: int) -> None` — função **síncrona** (roda em
  threadpool via `BackgroundTasks`): abre `SessionLocal()` própria, busca as
  transações pendentes do batch (categoria nula, não ignoradas), classifica em
  lotes de 50 **commitando a cada lote**, atualiza `JOBS`. Exceção → status
  `"error"` (logada); sessão sempre fechada.
- `job_status(session, batch_id) -> dict` — monta a resposta do endpoint de
  progresso: contagens derivadas do banco (`regra`/`llm` por `source`,
  `pendente` = categoria nula e não ignorada, `total` = não ignoradas do
  batch, `done` = `regra + llm`) e status: valor de `JOBS` se existir; senão
  `"interrupted"` se há pendentes, `"done"` caso contrário.

### `app/routers/imports.py`

- `create_import` vira **`def`** (threadpool — event loop nunca mais bloqueia)
  e recebe `background_tasks: BackgroundTasks`:
  1. lê o arquivo (`file.file.read()`), `import_file`, `apply_rules`,
     `session.commit()` — tudo rápido;
  2. se há pendentes e LLM configurado: `JOBS[batch.id] = "running"` e
     `background_tasks.add_task(run_classification, batch.id)`;
     senão o job já nasce `done`.
  3. resposta: `{batch_id, filename, new_count, dup_count, classification}`
     com `classification = job_status(...)` (campo `classified` deixa de
     existir).
- Novo `GET /api/imports/{batch_id}/classification` → `job_status`
  (404 se batch não existe).
- `POST /api/classify/pending` já é `def`; comportamento inalterado.

### `app/services/llm.py`

`anthropic.Anthropic(api_key=..., timeout=120.0, max_retries=1)` — falha
passa a ser rápida e limitada; erros continuam engolidos (LLM é acessório).

## Frontend

### `src/api/types.ts`

```ts
export interface ClassificationProgress {
  status: "running" | "done" | "error" | "interrupted";
  total: number;
  done: number;
  counts: ClassifiedCounts;
}
```
`ImportResult.classified` → `ImportResult.classification: ClassificationProgress`.

### `src/api/hooks.ts`

`useClassification(batchId: number | null)` — `useQuery` com
`enabled: batchId != null` e `refetchInterval` de 1500ms enquanto
`status === "running"` (senão desliga).

### `src/pages/Imports.tsx`

- Upload responde rápido; cada resultado renderiza
  `<ClassificationStatus batchId initial>`: mostra
  "classificando {done}/{total}…" enquanto `running`; ao terminar, as
  contagens finais (regra/LLM/pendentes); `interrupted` → dica de usar
  "Reclassificar pendentes"; `error` → aviso.
- Quando o status sai de `running`, invalida as queries (dashboard e
  transações atualizam). A invalidação pós-upload existente permanece
  (novas transações aparecem imediatamente, ainda sem categoria).

## Casos de borda

- Sem `ANTHROPIC_API_KEY`: como hoje, tudo fica pendente; status nasce
  `done` (sem job), UI mostra pendentes.
- LLM devolve categoria desconhecida: transação continua pendente; `done`
  do progresso conta só classificadas (a barra pode terminar < total antes
  de status `done` — aceitável).
- Vários arquivos num upload: um job/linha de progresso por batch.
- Queda no meio: lotes commitados ficam; próximo GET vê `interrupted`.

## Testes

- Backend (LLM fake via monkeypatch; suíte já isola a API key real):
  import retorna rápido com `classification.status` correto (`running` com
  LLM, `done` sem); `run_classification` commita por lote e finaliza `done`;
  `job_status` deriva `interrupted`/`done` sem entrada em `JOBS`; endpoint
  404 para batch inexistente; cliente Anthropic construído com
  `timeout=120.0, max_retries=1`; `/classify/pending` inalterado.
- Frontend (Vitest, environment node): helper puro de texto de progresso
  (`describeProgress`) cobrindo os 4 status.

## Fora de escopo

- SSE/WebSocket; persistência do status de job; fila de jobs concorrentes
  (uploads sequenciais já são atendidos por job/batch); progresso do parse
  (é instantâneo).
