# Resumo dinâmico e ordenação na tela de Transações — Design

**Data:** 2026-08-07
**Status:** aprovado

## Objetivo

Na tela de Transações: (1) mostrar o total das transações filtradas —
entradas, saídas e saldo — recalculado a cada mudança de filtro; (2) permitir
ordenar a tabela pelas colunas.

## Decisões

- **Formato do total** (escolha do usuário): linha de resumo com contagem,
  entradas, saídas e saldo.
- **Tudo client-side**: a tela já carrega a lista completa do filtro (sem
  paginação); nenhuma mudança de backend/API/tipos.
- **Ignoradas fora da soma**, mesmo quando visíveis pelo checkbox
  (consistente com o fluxo de caixa, que as exclui). Quando houver ignoradas
  visíveis, a linha ganha o sufixo "(ignoradas fora da soma)".

## Componentes

### `frontend/src/lib/txTable.ts` (novo)

Helpers puros, testáveis em Vitest (environment node):

- `summarize(txs: Tx[]) -> {count, entradas, saidas, saldo, temIgnoradas}` —
  soma apenas não-ignoradas: `entradas` = soma dos `amount_cents > 0`,
  `saidas` = soma absoluta dos negativos, `saldo = entradas - saidas`;
  `count` = quantidade de não-ignoradas; `temIgnoradas` = há ignoradas na
  lista.
- `type SortKey = "date" | "description" | "account" | "amount_cents" | "category" | "source"`
- `sortTxs(txs, key, dir, lookups) -> Tx[]` — cópia ordenada; `dir` é
  `"asc" | "desc"`; `lookups = {accountName: Map<number,string>, categoryName: Map<number,string>}`
  para ordenar Conta/Categoria pelo nome; categoria/origem nulas vão para o
  fim independentemente da direção; strings comparadas com
  `localeCompare("pt-BR", {sensitivity: "base"})`.

### `frontend/src/pages/Transactions.tsx`

- Estado `sort: {key: SortKey, dir: "asc" | "desc"} | null` (null = ordem da
  API, o padrão atual). Clique no cabeçalho: 1º clique ordena `asc`,
  2º alterna para `desc`, clique em outra coluna começa `asc`.
- Cabeçalhos das 6 colunas de dados viram clicáveis com indicador ▲/▼ na
  coluna ativa (a coluna de ações fica de fora).
- `useMemo` para a lista ordenada e para o resumo.
- Linha de resumo no card da tabela, acima dela, formatada com `formatBRL`:
  `"{count} transações · entradas {…} · saídas {…} · saldo {…}"`, saldo com
  a classe `pos` quando positivo. Precisa do `useCategories` (hook já
  existente) para o lookup de nomes de categoria.

## Testes

`frontend/src/lib/txTable.test.ts`: `summarize` (mistura de entradas/saídas,
ignoradas fora da soma, lista vazia); `sortTxs` por data, valor, conta e
categoria nos dois sentidos; nulos de categoria sempre no fim; não muta a
lista original.

## Fora de escopo

Paginação; ordenação/soma no backend; persistir a ordenação escolhida.
