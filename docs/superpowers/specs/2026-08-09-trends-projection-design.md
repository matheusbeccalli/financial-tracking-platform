# Design: página "Tendências e Projeção"

**Data:** 2026-08-09
**Status:** aprovado em brainstorming

## Objetivo

Nova página que mostra, numa matriz categorias × meses, o realizado dos meses passados e
o orçamento vigente do mês atual e futuros — para enxergar tendências por categoria,
ajustar o orçamento (e o comportamento) e ver a projeção de fluxo de caixa acumulado,
respondendo "o plano é sustentável daqui para frente?".

## Decisões de produto

- **Janela fixa:** 6 meses passados + mês atual + 6 futuros (13 colunas de dados).
- **Passado = fato, atual/futuro = plano:** meses passados mostram o realizado por
  categoria; mês atual e futuros mostram (e editam) o orçamento vigente. O mês atual é
  orçamento puro — o realizado parcial dele continua no dashboard.
- **Coluna "média 6m"** entre o passado e o mês atual: média aritmética do realizado dos
  6 meses passados (mês sem movimento conta como zero), por categoria e por total.
- **Acumulado a partir do mês atual:** a linha de projeção zera no início do mês atual e
  acumula os saldos projetados para frente; células do passado ficam vazias.
- **Células de orçamento editáveis** na própria matriz (mês atual e futuros), com a
  semântica de vigência existente: o valor gravado vale daquele mês em diante até outro
  registro mais recente.

## Estrutura da tabela

**Colunas:** rótulo da linha (sticky) | 6 meses passados | média 6m | mês atual | 6 meses
futuros. O mês atual ganha marcação visual sutil (fronteira fato/plano). Rolagem
horizontal dentro do card se necessário.

**Linhas, agrupadas por kind como no resto do app:**

1. **Entradas** — uma linha por categoria ativa, depois "Total entradas".
2. **Saídas** — idem, "Total saídas".
3. **Investimentos** — idem, "Total investimentos". Realizado exibe o líquido **com
   sinal** (consistente com dashboard: positivo = aportou mais que resgatou).
4. **Saldo do mês** — passado: `saldo.real` do summary; atual/futuro: `saldo.orcado`
   (entradas − saídas − investimentos orçados).
5. **Acumulado** — vazia no passado; do mês atual em diante, soma corrente dos saldos
   projetados. Positivo em verde, negativo em vermelho.

**Marcador de tendência:** nas linhas de **totais** (não nas categorias individuais),
célula de orçamento cujo valor destoa da média 6m ganha marcador sutil (ex.: total de
saídas orçado abaixo da média realizada). Sem marcadores por categoria para não poluir.

## Dados: frontend puro, sem backend novo

`month_summary` já funciona para qualquer mês: em mês futuro retorna `real = 0`, o
orçamento vigente por categoria (via `budget_map`) e `saldo.orcado`. A matriz inteira é
`useSummaries(13 meses)` — o mesmo hook do histórico do orçamento — combinado com
`useCategories` para as linhas (categorias ativas, como na tela Orçamento).

Alternativa descartada: endpoint novo `GET /api/dashboard/trends` (uma chamada só) —
duplicaria a agregação do `month_summary`, exigiria schema e testes de API, e não traria
ganho prático num app local (13 requests em SQLite local; react-query cacheia os meses
compartilhados com dashboard/orçamento).

## Edição

- Mesmo componente de input da tela Orçamento (`BudgetInput`: valor em reais, grava no
  blur/Enter), extraído para componente compartilhado.
- Salvar faz `PUT /api/budgets {category_id, amount_cents, valid_from: mês-da-coluna}`;
  a invalidação global de queries existente refaz os summaries e a projeção recalcula.
- A propagação da vigência fica visível: após salvar, as colunas seguintes sem valor
  próprio mudam junto. A página leva a mesma frase explicativa da tela Orçamento
  ("valores valem a partir de X até você mudar de novo").
- Realizado e média 6m são só leitura.
- Erro de mutação: toast global existente; célula volta ao valor efetivo no refetch.

## Arquitetura de código

**Novos:**

- `frontend/src/lib/trends.ts` — módulo puro: monta a matriz a partir de `Summary[]` +
  lista de meses, calcula média 6m (por categoria e por total), saldos por mês e
  acumulado a partir do mês atual. Sem fetch; recebe dados prontos, devolve estruturas
  prontas para render.
- `frontend/src/lib/trends.test.ts` — testes vitest do módulo.
- `frontend/src/pages/Trends.tsx` — a página: `useSummaries(13)` + `useCategories` +
  `usePutBudget`, renderiza a tabela com coluna de rótulos sticky.
- `frontend/src/components/BudgetInput.tsx` — `BudgetInput` extraído de `Budget.tsx`
  (refactor mínimo, comportamento idêntico).

**Modificados:** `frontend/src/App.tsx` (rota `/tendencias`), sidebar no Layout (item
"📈 Tendências"), `frontend/src/pages/Budget.tsx` (importa o BudgetInput extraído).

**Meses:** utilitários existentes de `lib/months.ts` (`lastNMonths`, `addMonths`,
`currentMonth`, `monthLabel`); nenhum código novo de datas.

## Casos de borda

- Categoria ativa sem movimento e sem orçamento: linha aparece (lista vem de
  `useCategories`), células zeradas/vazias; média 0.
- Categoria arquivada: fora das linhas (consistente com a tela Orçamento); realizado
  passado dela não aparece (consistente com o dashboard, que também a omite).
- Categoria criada recentemente: meses passados sem dados contam zero na média.
- Virada de ano na janela: coberta pelos utilitários de `months.ts`.
- Summaries ainda carregando: células "…" como no histórico do orçamento.

## Testes

- **`trends.test.ts` (vitest):** média com meses vazios; acumulado positivo/negativo;
  investimento com sinal (líquido negativo no realizado); categoria presente só em
  alguns meses; janela atravessando a virada de ano; saldo projetado =
  entradas − saídas − investimentos.
- **Sem testes de backend** (nenhuma mudança de backend).
- **Verificação visual final (Playwright):** tabela renderizada com os três grupos,
  edição de célula propagando para colunas seguintes, acumulado recalculando após
  edição, marcação do mês atual.
