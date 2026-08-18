# Suspeita de duplicata entre origens (arquivo × Pluggy)

Data: 2026-08-18
Branch: `feat/dedupe-cross-origem`

## Problema

O `dedupe_hash` inclui a descrição normalizada (`app/dedupe.py`). Bradesco e Inter
descrevem o mesmo lançamento de formas diferentes conforme a origem, então a mesma
transação importada por duas vias gera dois registros:

| origem A | origem B |
| --- | --- |
| `Transfe Pix Des: Renata Fogaca da Silv 02/08` (OFX) | `PIX ENVIADO - DES  RENATA FOGACA DA SILV 02/08 - DOCTO: 2128` (Pluggy) |
| `PG *CALVIN KLEIN 1/2` (CSV de fatura) | `PG *CALVIN KLEIN` (Pluggy) |
| `Iof s/ Utilizacao Limite` (OFX de 07/08) | `Iof Util Limite` (OFX de 09/08) |

O problema não é exclusivo da Pluggy: dois OFX do mesmo período também divergem.
Em alguns casos a data também difere em 1 dia (a Pluggy datou `RENTAB.INVEST` em
18/08 e o extrato em 17/08).

Em 17/08 e 18/08 foram apagadas 35 duplicatas à mão via SQL. Sem detecção, isso
volta a acontecer a cada import.

## O que este trabalho faz

Detecta a suspeita no momento do import, marca a transação nova apontando para a
que ela parece duplicar, e dá ao usuário as duas ações que faltam para resolver:
**apagar** uma transação e **dispensar** a marca.

Decisão explícita: marcar, nunca pular. A regra tem falso positivo possível
(dois lançamentos legítimos de mesmo valor dentro de 3 dias), e perder lançamento
é pior do que marcar demais.

## Regra de detecção

Novo módulo `app/services/suspect.py`, chamado no fim de `import_parsed`
(`app/services/importer.py`) sobre as linhas recém-criadas — caminho único de
arquivo e de Pluggy.

Para cada linha nova `t`, é candidata a gêmea uma transação existente `c` com:

1. `c.account_id == t.account_id`
2. `c.amount_cents == t.amount_cents` (valor exato, sinal incluído)
3. `abs(c.date - t.date) <= 3` dias
4. `c.batch_id != t.batch_id` — repetição dentro do mesmo arquivo é legítima
   (ex.: os dois TEDs de R$ 1.500 no mesmo dia)
5. **não** vale `c.installment and t.installment and c.installment != t.installment`
   — parcelas diferentes da mesma compra compartilham data e valor
   (`HUGO BOSS 1/10` × `2/10`); esse é o falso positivo conhecido
6. `c.duplicate_of_id is None` — não encadeia marca sobre marca

Entre as candidatas vence a de menor `|Δdata|`; empate resolve pelo menor `id`.
Uma candidata só pode ser reclamada por uma linha nova do lote.

Data, valor e descrição idênticos não chegam aqui: o `dedupe_hash` já barra antes.

## Modelo de dados

`Transaction.duplicate_of_id: int | None`, FK para `transactions.id`.
A marca fica na linha **nova**, apontando para a antiga.

Sem Alembic no projeto (`init_db` usa `create_all`), então a coluna entra por
script one-off no padrão do `scripts/migrate_dedupe_hash_v2.py`:
`scripts/migrate_add_duplicate_of.py` faz backup do `.db` e roda
`ALTER TABLE transactions ADD COLUMN duplicate_of_id INTEGER`.

## API

- `tx_out` passa a devolver `duplicate_of_id` e, quando houver,
  `duplicate_of: {id, date, description, origin}`, com `origin` = `source` do
  `import_batch` da gêmea (`ofx` | `csv` | `pluggy`). A lista resolve todas as
  gêmeas em uma consulta só (sem N+1).
- `DELETE /api/transactions/{id}` → 204. Antes de apagar, zera o
  `duplicate_of_id` de quem apontava para essa linha, para não sobrar marca
  órfã. 404 se não existir.
- `POST /api/transactions/{id}/not-duplicate` → zera a marca da própria linha e
  devolve a transação. Endpoint próprio em vez de campo no `TxPatch`: o PATCH
  hoje carrega intenção de classificação (`category_id`, `ignored`), e "não é
  duplicata" não é classificação.
- Resposta de `POST /api/imports` e cada item de `sync_all` ganham
  `suspect_count`, contado das linhas novas do lote. Sem coluna nova em
  `import_batch` — o histórico continua com novas/duplicadas.

## Frontend

- `Tx` (`api/types.ts`) ganha `duplicate_of_id` e `duplicate_of`.
- Badge "possível duplicata" na linha da tabela, com `title` descrevendo a
  gêmea (data, descrição, origem). O ✕ do badge chama `not-duplicate`.
- `TxStatus` (`lib/txTable.ts`) ganha `"duplicadas"`; `statusCounts` passa a
  contar e a FilterBar mostra o chip ao lado de "Sem categoria".
- Coluna de ação 🗑 ao lado do ⊘ existente, com `confirm()` antes de chamar o
  DELETE. Vale para qualquer linha, não só as suspeitas — hoje não existe apagar
  transação individual, só o ⊘ que cria `ignore_rule` retroativa por descrição.
- ResultCard (Importar) e SyncCard (Pluggy) mostram "N possíveis duplicatas"
  quando `suspect_count > 0`.

## Testes

Backend:
- janela de data (0, 3 e 4 dias de diferença)
- exceção das parcelas: `1/10` × `2/10` não marca; `1/2` × sem parcela marca
- mesmo lote não marca
- escolha da gêmea mais próxima e desempate por id
- uma gêmea não é reclamada por duas linhas novas
- sem candidata: `duplicate_of_id` fica nulo
- `DELETE` remove a linha, limpa a referência de quem apontava e devolve 404
  para id inexistente
- `not-duplicate` zera a marca sem apagar
- `import_parsed` devolve `suspect_count` correto pelos dois caminhos

Frontend:
- `statusCounts` e `filterTxs` com o estado `duplicadas`
- render do badge com o texto da gêmea e do botão apagar
- `confirm()` negado não chama a API

## Fora de escopo

- Varredura retroativa do banco: os dados foram limpos em 17 e 18/08, e os
  lançamentos PENDING que a Pluggy ainda vai postar caem na regra nova quando
  chegarem.
- Casar transações por identificador do banco (DOCTO/FITID): o Bradesco
  regenera FITID a cada exportação, foi o que motivou o dedupe v2.
- Mesclar as duas linhas preservando categoria: apagar uma e manter a outra
  resolve o caso real com muito menos código.
