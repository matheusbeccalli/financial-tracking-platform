# Tela de Parcelamentos — Design

Data: 2026-08-18
Status: aprovado em conversa; aguardando revisão do spec escrito

## Objetivo

Nova tela que dá visão dos parcelamentos de cartão de crédito: a partir das parcelas
que aparecem no último mês completo (em agosto, lê julho), projeta mês a mês os
valores já contratados para os próximos meses e cruza com o orçamento por categoria,
destacando quando as parcelas sozinhas comprometem ou estouram o orçamento de um mês.

## Decisões de escopo (tomadas com o usuário)

1. **Fonte de dados: estruturar + Pluggy.** Colunas estruturadas de parcela na
   transação, preenchidas pela regex existente e pelo `creditCardMetadata` da Pluggy.
2. **Alerta de orçamento: estouro + zona de risco.** Estouro quando parcelas > orçamento
   do mês; risco quando parcelas ≥ 80% do orçamento.
3. **Mês de referência navegável**, padrão = último mês completo (MonthPicker padrão do app).
4. **Conteúdo: matriz categoria × mês + lista de compras ativas.**
5. **Arquitetura: endpoint backend dedicado** que devolve a projeção pronta.

## 1. Modelo de dados e captura

Duas colunas novas em `Transaction` (a string `installment` existente permanece, para
exibição e compatibilidade):

- `installment_number: int | null` — nº da parcela (1-based)
- `installment_total: int | null` — total de parcelas

Regras de validade (mesmas do `extract_installment`): `1 <= number <= total` e `total >= 2`.
Fora disso, ambos ficam `NULL`.

Preenchimento por fonte:

- **Regex (OFX/CSV/fatura Bradesco):** `extract_installment` em `backend/app/normalize.py`
  já captura `N/T`; o importer (`backend/app/services/importer.py`) passa a gravar também
  os dois inteiros junto com a string.
- **Pluggy:** `ParsedTransaction` (`backend/app/parsers/__init__.py`) ganha os campos
  opcionais `installment_number` e `installment_total` (default `None`); `to_parsed`
  (`backend/app/services/pluggy_sync.py`) lê `creditCardMetadata.installmentNumber` /
  `totalInstallments` do payload (hoje descartado). Payload ausente ou malformado
  (não-inteiro, fora das regras de validade) → campos `None`, sem erro. Quando os campos
  vêm da Pluggy, a string `installment` é derivada deles no formato `"NN/TT"` com dois
  dígitos, para o badge existente funcionar.
- **Migração:** script one-off em `scripts/` no molde de `migrate_dedupe_hash_v2.py`
  (backup do `.db` antes de alterar): `ALTER TABLE` adicionando as colunas + backfill
  parseando as strings `installment` existentes com a mesma regra de validade. O backfill
  cobre todas as contas; os 19 falsos positivos de conta corrente (datas de Pix lidas
  como parcela) são neutralizados pelo filtro `kind = "cartao"` do endpoint, não pela
  migração.

Não persistimos `purchaseDate`/`totalAmount` da Pluggy: para a projeção bastam parcela
atual, total e valor (YAGNI; reavaliá-los após o primeiro sync real).

## 2. Endpoint e lógica de projeção

`GET /api/installments/projection?month=YYYY-MM`

`month` é o mês de referência, validado por `require_month`. Lógica:

1. Seleciona transações com `date` dentro de `month_bounds(month)`, em contas
   `kind = "cartao"`, não ignoradas, com `installment_number`/`installment_total`
   preenchidos e `amount_cents < 0`.
2. **Cada transação parcelada do mês de referência é uma série ativa.** Como toda série
   ativa tem exatamente uma parcela em cada fatura mensal, um único mês fechado captura
   todas. Projeção: restam `total − number` parcelas, uma por mês a partir do mês
   seguinte ao de referência, cada uma com o mesmo `amount_cents`.
3. Agrega por categoria × mês; transação sem categoria entra na linha "Sem categoria".
   Horizonte: do mês seguinte ao de referência até o mês da última parcela projetada
   (sem corte artificial). Valores na resposta são positivos (magnitudes), como na tela
   de Orçamento.
4. Para cada mês do horizonte, resolve o orçamento por categoria com `budget_map`
   (semântica de vigência já existente) e calcula o status da célula:
   - `ok` — parcelas < 80% do orçamento, ou categoria sem orçamento no mês
   - `risco` — parcelas ≥ 80% do orçamento e ≤ orçamento
   - `estouro` — parcelas > orçamento
   A linha "Sem categoria" nunca tem orçamento, logo é sempre `ok`.
   O limiar de 80% é uma constante no serviço.
5. Resposta (nomes em português, no padrão de `month_summary`):

```json
{
  "month": "2026-07",
  "months": ["2026-08", "2026-09"],
  "categorias": [
    {
      "id": 3,
      "nome": "Mercado",
      "parcelas": [45000, 45000],
      "orcado": [400000, 400000],
      "status": ["ok", "ok"]
    }
  ],
  "totais": [123400, 78400],
  "series": [
    {
      "tx_id": 987,
      "descricao": "MAGALU 03/10",
      "conta": "Bradesco Cartão",
      "categoria_id": 3,
      "categoria_nome": "Mercado",
      "numero": 3,
      "total": 10,
      "valor": 45000,
      "termina_em": "2027-03",
      "restante": 315000
    }
  ]
}
```

Índices dos arrays `parcelas`/`orcado`/`status`/`totais` alinham com `months`.
`orcado` nulo quando a categoria não tem orçamento no mês. `restante` = valor × parcelas
restantes. Mês sem parcelas → `months: []`, `categorias: []`, `series: []` (resposta
vazia válida, não erro).

Implementação: serviço novo `backend/app/services/installments.py` (lógica pura sobre a
sessão) + router `backend/app/routers/installments.py` registrado em `main.py`.

Limitação assumida: o alerta compara o orçamento total da categoria contra apenas as
parcelas contratadas — gastos novos não parcelados não entram. É a semântica escolhida
(opção "estouro + zona de risco"), sem previsão de gasto típico.

## 3. Tela `/parcelamentos`

Nova rota `/parcelamentos`, label **Parcelamentos** na sidebar entre Orçamento e
Tendências (`App.tsx`, `Layout.tsx`). A rota entra na lista `main--wide` do Layout,
como Tendências.

Composição (padrão das páginas existentes):

- **PageHeader** com MonthPicker; mês inicial = `addMonths(currentMonth(), -1)`.
  Subtítulo: "parcelas lidas da fatura de {mês}".
- **Strip de KPIs:** total restante contratado (soma de `restante` das séries), nº de
  compras parceladas ativas, nº de meses com estouro e com risco no horizonte.
- **Card matriz** categoria × mês no estilo do `MatrixCard` de Tendências (grid CSS,
  coluna de categoria + uma por mês, valores em `formatUnits`). Célula: valor das
  parcelas; tom `tone-warn` em risco e `tone-over` em estouro, exibindo o orçamento na
  célula alertada (ex.: "450 / orç. 400"). Linha de totais no rodapé.
- **Card lista de compras ativas:** tabela com descrição, conta, categoria, badge
  `tx-parcela` `N/T`, valor mensal, término (`monthLabel`) e total restante; ordenada
  por restante decrescente.
- Estados: `Carregando…`, `<p className="error">` em falha, empty state em card `muted`
  quando não há parcelas no mês (com dica de que o sync Pluggy passa a alimentar a tela).

Camada de API: tipo `InstallmentsProjection` em `api/types.ts`, hook
`useInstallmentsProjection(month)` em `api/hooks.ts`. Derivações (KPIs, ordenação)
em `frontend/src/lib/installments.ts` como funções puras.

## 4. Testes

- **Backend (pytest, `backend/tests/`):**
  - projeção de uma série: nº de meses, valores, `termina_em`, `restante`;
  - última parcela (`number == total`) → nada projetado;
  - filtro `kind = "cartao"` exclui falsos positivos de conta corrente;
  - transações ignoradas fora;
  - vigência do orçamento aplicada mês a mês (mudança de `valid_from` no meio do horizonte);
  - status ok/risco/estouro, incluindo categoria sem orçamento e limiar exato de 80%;
  - mês sem parcelas → resposta vazia válida;
  - `to_parsed` com `creditCardMetadata` presente, ausente e malformado;
  - importer preenchendo os inteiros via regex.
- **Frontend (vitest):** funções puras de `lib/installments.ts`; sem teste de render
  (convenção do projeto).
- **Migração:** backup automático antes de alterar; validação manual pós-execução
  (contagem de linhas com backfill vs linhas com string `installment`).

## Fora de escopo

- Entidade de fatura/ciclo (mês da parcela = `Transaction.date`).
- Previsão de gasto típico não parcelado no alerta de orçamento.
- Persistir `purchaseDate`/`totalAmount` da Pluggy.
- Edição de orçamento a partir desta tela (edita-se em Orçamento/Tendências).
