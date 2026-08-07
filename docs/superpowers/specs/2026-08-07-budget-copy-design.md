# Copiar orçamento de outro mês — Design

**Data:** 2026-08-07
**Status:** aprovado

## Objetivo

Na tela de Orçamento, copiar o orçamento de um mês anterior para o mês
visualizado com um dropdown — o mês copiado passa a ser o novo orçamento do
mês visualizado.

## Contexto do modelo

`Budget` usa `valid_from` ("YYYY-MM", unique com `category_id`): um valor vale
do mês em diante até ser sobrescrito (`budget_map` resolve o efetivo). Copiar
serve para restaurar o perfil de um mês anterior por cima de mudanças feitas
depois.

## Decisões

- **Snapshot exato**: copiar S → M grava em M (valid_from=M) o valor efetivo
  de S para **todas as categorias ativas**; categoria sem orçamento em S fica
  com 0 em M. Depois da cópia, M ≡ S. Sobrescreve o mês inteiro → `confirm()`
  no frontend antes.
- **Backend atômico**: um endpoint novo, um commit — não ~20 PUTs do
  frontend.

## Backend

- `app/schemas.py`: `BudgetCopy(from_month: str, to_month: str)`.
- `app/routers/budgets.py`: `POST /api/budgets/copy`:
  1. `require_month` nos dois campos; `from_month == to_month` → 400.
  2. `bmap = budget_map(session, from_month)`.
  3. Para cada categoria ativa (`~Category.archived`): upsert de
     `Budget(category_id, valid_from=to_month, amount_cents=bmap.get(id, 0))`
     no mesmo padrão do PUT existente (atualiza se a linha `category_id +
     valid_from` já existir).
  4. `session.commit()`; retorna `{"copied": <nº de categorias gravadas>}`.

## Frontend

- `src/api/hooks.ts`: `useCopyBudget` via `useInvalidatingMutation`
  (`POST /budgets/copy`).
- `src/pages/Budget.tsx`: no cabeçalho, junto do `MonthPicker`, um `<select>`
  com opção placeholder "Copiar de…" e dois grupos: **12 meses anteriores**
  (mais recente primeiro) e **12 meses seguintes** (mais próximo primeiro),
  rótulos `monthLabel`. Copiar de mês futuro é intencional (decisão de
  2026-08-07: ex. ajustes feitos em julho replicados para junho); o mês
  futuro mantém suas próprias linhas `valid_from`, que continuam valendo
  dele em diante. Ao escolher:
  `window.confirm("Substituir o orçamento de {M} pelo de {S}?")` → mutation →
  invalidação global (padrão existente) atualiza tabela, saldo projetado e
  histórico; o select volta ao placeholder (value controlado sempre `""`).

## Testes

Backend (`tests/test_api_budgets_copy.py` ou no arquivo de budgets
existente): cópia com valores herdados (valid_from antigo), sobrescrita de
valor existente no destino, categoria sem orçamento na origem vira 0,
idempotência (copiar duas vezes não duplica linhas — unique constraint),
`from == to` → 400, mês inválido → 400. Frontend: sem teste novo (dropdown
fino sobre hook existente; Vitest é node-only) — verificação via Playwright.

## Fora de escopo

Copiar entre meses arbitrários sem visualizar o destino; desfazer cópia;
copiar categorias arquivadas.
