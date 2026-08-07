# Design: categoria de investimentos (kind "investimento")

**Data:** 2026-08-07
**Status:** aprovado em brainstorming

## Problema

A categoria "Investimentos" é hoje uma categoria de saída (`kind: "saida"`) que recebe
tanto aportes (transações negativas) quanto resgates (transações positivas). Como
`real_by_category` soma o valor líquido por categoria e `month_summary` decide o sinal
econômico pelo `kind` da categoria, um resgate **cancela** aportes do mês e o líquido
entra no total de Saídas. Consequências:

- Resgates reduzem o total de Saídas do mês (inflando o Saldo aparente) — ex.: junho/2026.
- Se resgates > aportes, a linha da categoria mostra `abs(líquido)` como se fosse gasto,
  com sinal errado e visualmente indistinguível.
- O ruído contamina KPIs, barras por categoria, gráfico de evolução, bridge e histórico
  do orçamento — tudo deriva do mesmo `month_summary`.

## Conceito escolhido

Visão de **fluxo líquido**: investimentos sai de Entradas/Saídas e vira um indicador
próprio com o líquido do mês (aportes − resgates).

- **Dashboard:** novo indicador "Investido" (líquido do mês vs. meta). Entradas e Saídas
  passam a refletir apenas renda e consumo.
- **Orçamento:** Investimentos continua orçável, em seção própria; a meta mensal é
  comparada ao **líquido** do mês (meta vs. aportes − resgates).
- **Saldo:** continua sendo variação de caixa real —
  `saldo = entradas − saídas − líquido investido`. Numericamente idêntico ao saldo atual.

Alternativas descartadas:

- *Aporte como saída orçável + resgates como categoria de entrada:* resgates inflariam
  Entradas e não haveria meta vs. líquido.
- *Movimentação patrimonial (excluir tudo):* Saldo deixaria de refletir o caixa e a meta
  de aporte sumiria do orçamento.

## Abordagem de implementação

**Terceiro valor de `Category.kind`: `"investimento"`** (além de `"entrada"` e `"saida"`).

- `kind` já é coluna string — **sem migração de banco**; converter a categoria
  "Investimentos" existente é atualizar o valor da linha (via UI, ver abaixo).
- O app já ramifica por `kind` em todos os pontos de intervenção (`month_summary`,
  `bridge`, `Budget.tsx`, `CategoryBars`, `Settings`), então o terceiro valor flui
  naturalmente para uma terceira seção/grupo em cada tela.
- Generaliza: futuras categorias ("Cripto", "Previdência") ganham o mesmo tratamento
  só pelo kind.

Descartadas: flag booleana na categoria (exige coluna nova sem Alembic, semântica menos
clara) e duas categorias separadas (não entrega a visão de líquido).

## Backend

### Modelo e schemas

- `CategoryIn` e `CategoryPatch` aceitam `kind ∈ {"entrada", "saida", "investimento"}`;
  valores fora disso são rejeitados.
- `CategoryPatch` passa a permitir editar `kind` (hoje imutável). É o mecanismo de
  conversão da categoria existente, sem script manual.

### `month_summary` (services/budget.py)

- `real_by_category` continua igual (soma líquida assinada por categoria).
- Categorias `investimento` saem de `entradas_real`/`saidas_real`.
- Novo bloco no payload: `investimentos: { real, orcado }`:
  - `real`: líquido **com sinal** do mês somado sobre todas as categorias
    `investimento` (positivo = aportou mais do que resgatou).
  - `orcado`: soma das metas vigentes (mesma mecânica de `budget_map`, valor positivo).
- `saldo = entradas_real − saidas_real − investimentos.real` — idêntico ao valor atual.
- `ritmo` continua usando apenas saídas (agora limpas de resgates).
- Linhas de `categorias` com kind `investimento` trazem `real` **com sinal** (sem
  `abs()`); linhas de entrada/saída mantêm o comportamento atual.
- `uncat_in`/`uncat_out` intocados.

### Orçamento (API)

- `Budget` inalterado: valor positivo por `(categoria, mês)`; para categoria
  `investimento` significa "líquido desejado no mês".
- `POST /budgets/copy` já inclui as categorias por não serem arquivadas — sem mudança.

### Bridge (services/bridge.py)

- Categorias `investimento` mantêm tratamento de sinal igual ao de saída
  (`orc_signed = −orcado`; delta = real − planejado), agrupadas/rotuladas como
  investimento. O saldo do bridge continua batendo com o KPI.
- Períodos `ytd`/`12m`: mesma agregação, sem caso especial.

## Frontend

### Dashboard

- **KpiRow:** quinto tile "Investido" — líquido do mês, subtexto com a meta
  (ex.: "meta R$ 2.500"). Líquido negativo (mês de resgate) exibido com sinal e cor de
  destaque. Grid acomoda 5 tiles no padrão responsivo atual.
- **CategoryBars:** terceiro bloco "Investimentos", barra de líquido vs. meta:
  - Líquido positivo: progresso normal; atingir/superar a meta é **bom** — cor de
    sucesso, sem estilo de estouro.
  - Líquido negativo: barra vazia com valor explícito
    (ex.: "−R$ 500 · resgate líquido"), estilo neutro/alerta.
  - Sem meta: mostra só o líquido, sem percentual.
- **EvolutionChart:** sem mudança de componente — fica limpo automaticamente porque usa
  `saidas.real` do summary.
- **BridgeChart:** apenas rotulagem do grupo investimento.
- **LlmFeed / Transações / CategorySelect:** sem mudança. A página de transações soma
  pelo sinal da transação (já honesto); "Investimentos" continua atribuível a
  transações de qualquer sinal — comportamento desejado (aporte e resgate na mesma
  categoria).

### Orçamento

- **Budget.tsx:** terceira seção "Investimentos" com a mesma UX de edição de meta
  (valor positivo = líquido desejado).
  `saldoProjetado = total(entradas) − total(saídas) − total(investimentos)`.
- **BudgetHistory:** nova coluna "Investido" (real vs. orçado) para os números
  reconciliarem à vista: Entradas − Saídas − Investido = Saldo.

### Settings

- Edição de `kind` na categoria, com confirm simples avisando que dashboards de meses
  passados serão reinterpretados retroativamente (o summary é calculado on-the-fly —
  é assim que junho/2026 se corrige sem retrabalho; totais históricos de Saídas
  diminuem porque os aportes saem de lá).

## Casos de borda

- Categoria `investimento` sem meta no mês: `orcado = 0`; UI mostra só o líquido.
- Múltiplas categorias `investimento`: KPI soma os líquidos; uma barra por categoria.
- Transações sem categoria: mecânica `uncat_in`/`uncat_out` inalterada.

## Testes

- **Backend** (padrão da suíte existente):
  - `test_budget.py`: mês só com aportes; aporte + resgate parcial; resgate > aporte
    (líquido negativo — o bug de junho); categoria sem meta; `saldo` idêntico ao valor
    pré-mudança; `saidas_real` exclui investimentos.
  - `test_bridge.py`: delta e rótulo do grupo investimento.
  - `test_api_meta.py`: PATCH de `kind` aceito para os três valores, rejeitado para
    inválidos.
- **Frontend:** teste unitário da lógica de exibição da barra de investimento
  (positivo/negativo/sem meta), no padrão dos testes de `lib/`; verificação visual das
  telas ao final (webapp-testing).
