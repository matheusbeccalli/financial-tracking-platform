# Conector Open Finance via Pluggy (Meu Pluggy) — Design

**Data:** 2026-08-16
**Status:** Aprovado no brainstorming; aguardando plano de implementação

## Visão Geral

Fase 2 da plataforma: sincronizar transações do Bradesco direto do Open Finance, sem exportar OFX à mão. A porta de entrada no código já existe — `import_parsed(session, account_id, filename, source, parsed)` em `backend/app/services/importer.py` recebe `ParsedTransaction`s prontas e entrega dedupe, regras de ignorar e classificação LLM de graça. Este design cobre só o que falta: falar com a Pluggy, mapear contas e disparar o sync.

## Decisões (brainstorming 2026-08-16)

| Tema | Decisão |
|---|---|
| Credencial | Usuário ainda não tem conta Pluggy; caminho gratuito **Meu Pluggy** (uso pessoal, sem expiração). Widget Pluggy Connect embutido descartado: só viável no trial de 14 dias ou no plano Pro (R$ 2.500/mês). |
| Consentimento | Feito **fora do app**, no portal meu.pluggy.ai (fluxo Open Finance regulado, revogável). O app só consome a API com `clientId`/`clientSecret`. |
| Mapeamento de contas | **Vínculo manual em Configurações**: cada conta Pluggy é ligada explicitamente a uma `Account` local existente (ou nova). |
| Janela de busca | **Data de corte por conta** no vínculo (sugestão: dia seguinte à última transação da Account local) + **persistir a data do último sync** e usá-la como início da próxima busca, com sobreposição de segurança. |
| Gatilho | **Botão manual "Sincronizar"** na tela Importar (mantém a spec original; app local sob demanda). |
| Estrutura | **Tabela de vínculo dedicada** (`pluggy_link`); `Account` intocada; cliente Pluggy atrás de interface; sem abstração genérica de conectores (YAGNI — `import_parsed()` já é a interface plugável). |

## Setup único (manual, fora do app)

Documentar no README/spec e na UI (texto de ajuda na seção Open Finance):

1. Criar conta em **meu.pluggy.ai** e clicar "Conectar Minha Conta" para cada banco (Bradesco), completando o consentimento Open Finance.
2. Criar conta em **dashboard.pluggy.ai**, criar uma aplicação e obter `clientId`/`clientSecret`.
3. Vincular a conexão do Meu Pluggy à aplicação no dashboard (repetir a cada conta nova conectada).
4. Copiar o **Item ID** da conexão no dashboard (a API não expõe "listar todos os items" — o Actual Budget usa o mesmo fluxo de colar o ID).
5. Gravar em `backend/.env`: `PLUGGY_CLIENT_ID=...` e `PLUGGY_CLIENT_SECRET=...` (fora do git, como a chave Anthropic).

## Modelo de Dados

Tabela nova `pluggy_link`:

- `id` — PK
- `item_id` — str, o Item da Pluggy (uma conexão bancária pode ter várias contas)
- `pluggy_account_id` — str, **unique** (uma conta Pluggy só vincula a uma Account local)
- `account_id` — FK para `account`
- `sync_from` — date; o sync nunca grava nada anterior a esta data
- `last_synced_at` — datetime nullable; atualizado só quando o sync do vínculo termina com sucesso

`Account`, `Transaction` e `ImportBatch` não mudam. Cada sync gera **um `ImportBatch` por vínculo** com `source="pluggy"` e filename sintético legível: `Pluggy · <nome da Account> · <YYYY-MM-DD>`. Histórico de lotes e Desfazer existentes funcionam sem mudança.

## Backend

### `services/pluggy.py` — cliente da API

- Autentica com `POST /auth` (clientId/clientSecret → apiKey, validade ~2h; cachear e renovar em 401).
- `GET /items/{id}` (status do item/consentimento), `GET /accounts?itemId=`, `GET /transactions?accountId=&from=&to=` com paginação.
- **Atrás de interface** (mesmo padrão do LLM em `services/llm.py`): testes usam respostas gravadas; nenhum teste bate na API real.

### `services/sync.py` — orquestração

Para cada `pluggy_link`:

1. `from = max(sync_from, date(last_synced_at) − 3 dias)`, `to = hoje`. A sobreposição de 3 dias pega lançamentos que o banco publica com atraso; o dedupe v2 segura os repetidos porque a descrição da Pluggy é consistente com ela mesma (o risco cross-source arquivo×Pluggy é justamente o que o `sync_from` elimina).
2. Busca as transações paginadas, converte para `ParsedTransaction(date, description, amount_cents)`.
3. Chama `import_parsed(session, link.account_id, filename_sintético, "pluggy", parsed)`.
4. Sucesso → atualiza `last_synced_at`. Falha em um vínculo **não aborta os outros**; o resultado reporta por conta.

**Convenção de sinal (ponto de atenção):** nosso padrão é centavos inteiros com negativo = saída. A Pluggy expõe `amount` + tipo crédito/débito e a convenção difere entre conta corrente e cartão. O mapeamento será fixado na implementação **validado contra dados reais** da conta do usuário (mesmo processo dos parsers da fase 1); transações em moeda ≠ BRL são ignoradas com contagem reportada.

### Router `routers/pluggy.py`

- `GET /api/pluggy/links` — vínculos existentes (+ conta local, última sync), status da credencial (`.env` configurado?) e, por `Account` local, a data da última transação — é dela que a UI deriva a sugestão de `sync_from` (dia seguinte).
- `POST /api/pluggy/items` `{item_id}` — valida o item na API e devolve suas contas (id, nome, tipo, número mascarado) para a tela de vínculo.
- `POST /api/pluggy/links` `{item_id, pluggy_account_id, account_id, sync_from}` — cria vínculo; 409 se a conta Pluggy já está vinculada.
- `DELETE /api/pluggy/links/{id}` — remove o vínculo (transações já importadas ficam).
- `POST /api/pluggy/sync` — roda o sync de todos os vínculos; resposta por vínculo (lote criado, novas, duplicadas, erro); agenda a classificação LLM em background igual ao `POST /imports` (job em threadpool, `GET /imports/{id}/classification` já existe).

### Config

`config.py` ganha `pluggy_client_id: str = ""` e `pluggy_client_secret: str = ""` (pydantic-settings já lê o `.env`).

### Tratamento de erros

- Credencial ausente/inválida → erro claro apontando o `.env` (a UI mostra o estado antes de deixar sincronizar).
- Item com consentimento expirado/revogado (status do item na API) → mensagem "reconectar no meu.pluggy.ai".
- API Pluggy fora → 502 com mensagem; nada é gravado (mesma atomicidade por lote do import de arquivo).
- LLM continua acessório: sync nunca bloqueia por classificação.

## Frontend

- **Configurações › seção "Open Finance"**: estado da credencial; campo para colar Item ID → lista as contas do item, cada uma com select de Account local + input de data de corte (pré-preenchida com a sugestão do backend); vínculos existentes com última sincronização e botão remover. Reusa os primitivos do redesign (cards, chips, selects nativos).
- **Importar**: botão "Sincronizar" ao lado do dropzone (desabilitado sem vínculos, com dica apontando Configurações); durante o sync, estado de progresso; resultado renderiza os **mesmos ResultCards** por lote (5 métricas + polling de classificação existente). Histórico de lotes ganha badge de origem "OF" para `source="pluggy"` (`fileBadge` em `lib/imports.ts`).

## Testes

- **Backend**: transformação Pluggy→`ParsedTransaction` (sinais, datas, moeda estrangeira, paginação) com fixtures JSON gravadas; `sync` com cliente fake (novas/duplicadas/corte `sync_from`/atualização de `last_synced_at`/falha parcial entre vínculos); endpoints com SQLite em memória (vínculo duplicado → 409, credencial ausente, item inválido).
- **Frontend**: Vitest para libs/componentes novos (seção Open Finance, badge, estados do botão Sincronizar).
- **Verificação final**: Playwright nos fluxos de UI; com a conta Meu Pluggy criada, um sync real reversível (Desfazer) contra o Bradesco — mesma disciplina do "escritas no banco real sempre revertidas".

## Fora de Escopo

- Widget Pluggy Connect embutido (caminho pago; o backend só conhece itemIds, então embutir o widget no futuro é uma feature isolada).
- Sync agendado/automático e webhooks da Pluggy.
- Múltiplos CPFs/usuários.
- Investimentos via Pluggy (fase 3 poderá reusar `services/pluggy.py`).
