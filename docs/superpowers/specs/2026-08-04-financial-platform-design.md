# Plataforma de Controle Financeiro Pessoal — Design

**Data:** 2026-08-04
**Status:** Aprovado no brainstorming; aguardando plano de implementação

## Visão Geral

Plataforma web de controle financeiro para uso pessoal (usuário único), rodando localmente sob demanda. Três módulos previstos; este design cobre os dois primeiros:

1. **Tracking de despesas** com classificação automática por categoria
2. **Orçamento** mensal por categoria (real vs. orçado)
3. **Investimentos** — fora de escopo por enquanto

## Decisões Fundamentais

| Tema | Decisão |
|---|---|
| Fonte de dados | Híbrida: importação de OFX/CSV do **Bradesco e do Banco Inter** (fase 1) + conector Pluggy/Open Finance (fase 2), atrás de uma interface plugável comum |
| Stack | Backend Python/FastAPI + frontend React (Vite) |
| Classificação | Cascata: regras/memória primeiro, LLM via API Anthropic para o restante; **modelo configurável** (padrão Claude Haiku, trocável por Sonnet etc. sem mudar código); tudo aplica automaticamente, correções do usuário viram regras |
| Execução | Processo único local, sob demanda, sem Docker; FastAPI serve API + build do React em `localhost:8000` |
| Banco | SQLite (arquivo local; backup = copiar o arquivo) |
| Orçamento | **Fluxo de caixa mensal por categoria**: entradas (salário etc.) e saídas (despesas e aportes em investimento), real vs. orçado; valor vigente até ser alterado (com histórico de vigência) |
| Categorias | Lista simples (sem hierarquia), editável, semeada com padrões; cada categoria é `entrada` ou `saida` |
| Cartão de crédito | Regime de competência: gasto conta na data da compra; cada parcela conta no mês da sua fatura |

## Arquitetura

```
OFX/CSV (fase 1) ─┐
                  ├─> Ingestão (normaliza + deduplica) ─> Classificação (regras → Haiku) ─> SQLite
Pluggy (fase 2) ──┘                                                                          │
                                              React (Vite) <── FastAPI (REST + estáticos) <──┘
```

- **Processo único**: `./run.sh` sobe o FastAPI, que serve a interface. Sem serviços externos além da API Anthropic (e Pluggy na fase 2).
- **Segredos** em `.env` local (fora do git): chave da API Anthropic; futura credencial Pluggy.
- A ingestão implementa uma interface de "fonte de transações"; parsers de arquivo e conector Pluggy são implementações intercambiáveis que produzem o mesmo formato normalizado.

## Modelo de Dados (SQLite)

- **`account`** — contas do usuário, com instituição. Semeadas: "Bradesco Conta" e "Inter Conta" (`corrente`), "Bradesco Cartão" e "Inter Cartão" (`cartao`). Editável (adicionar/remover contas). A instituição determina qual parser/particularidades de arquivo usar.
- **`transaction`** — data (da compra), descrição original, descrição normalizada, valor em **centavos** (inteiro; negativo = saída), conta, categoria (nullable), origem da classificação (`regra` | `llm` | `manual` | nenhuma), lote de importação, hash de deduplicação (FITID do OFX quando existir; senão hash de data+valor+descrição), info de parcela ("02/10" parseado da descrição, para exibição), flag `ignorada`.
- **`category`** — nome, cor, tipo (`entrada` | `saida`), arquivada. Semeadas de saída (~15): Mercado, Restaurantes/Delivery, Transporte, Moradia, Contas & Utilidades, Saúde, Lazer, Assinaturas, Vestuário, Educação, Viagem, Presentes, Impostos & Taxas, **Investimentos** (aportes), Outros. Semeadas de entrada: Salário, Rendimentos, Outras Entradas.
- **`rule`** — descrição normalizada → categoria. Criada/atualizada automaticamente quando o usuário corrige uma classificação.
- **`budget`** — (categoria, valor mensal, vigente-a-partir-de), para categorias de entrada **e** de saída — o orçamento é de fluxo de caixa completo (salário orçado, despesas orçadas, aporte em investimentos orçado, saldo líquido projetado). Meses passados usam o valor vigente na época; ajustes não reescrevem o histórico.
- **`import_batch`** — arquivo, origem, data, contagens (novas/duplicadas). Permite auditoria e desfazer importação.

Comportamentos especiais:

- **Flag `ignorada`**: pagamentos de fatura no extrato da conta (detectados por padrão de descrição) e transferências **entre contas correntes próprias** (ex.: Bradesco → Inter) não contam no fluxo de caixa (evita dupla contagem). Aportes em investimento **não** são ignorados: são classificados na categoria de saída "Investimentos" e contam no fluxo.
- **Entradas** (valores positivos: salário, rendimentos) são classificadas em categorias de entrada e participam do orçamento de fluxo de caixa.

## Pipeline de Ingestão e Classificação

**Ingestão (fase 1 — arquivos):**

1. Upload de OFX (conta e cartão, Bradesco e Inter) na tela Importar; múltiplos arquivos por vez. CSV como fallback.
2. Parsers por instituição, tolerantes às particularidades de cada banco (encoding Latin-1, formatos de data, layout do CSV) — a conta selecionada/detectada determina o parser.
3. Normalização: descrição limpa (remove números de autorização, datas embutidas, sufixos), valor em centavos.
4. Deduplicação por hash — períodos sobrepostos podem ser importados sem duplicar; resumo mostra "N novas, M duplicadas".
5. Importação **atômica** por lote: ou entra tudo, ou nada.

**Classificação (cascata automática):**

1. **Regras**: descrição normalizada casa com regra existente → aplica direto (custo zero). Maioria dos casos após o primeiro mês.
2. **LLM (API Anthropic)**: desconhecidas vão em lote (~50/chamada) com a lista de categorias do usuário e exemplos de classificações anteriores; resposta em JSON estruturado. O **modelo é configurável** (nas Configurações; padrão Claude Haiku pelo custo, trocável por Sonnet para mais qualidade). Custo estimado com Haiku: < R$ 0,10/mês.
3. **Correção = aprendizado**: reclassificação na UI vira regra; a próxima ocorrência não chama o LLM. O dashboard exibe um feed "classificadas pelo LLM recentemente" para correção em um clique.

**Fase 2 (Pluggy)**: mesma normalização, deduplicação e classificação; muda só a origem (botão "Sincronizar" busca transações novas na API da Pluggy, com consentimento Open Finance oficial no Bradesco).

## Interface (5 telas)

1. **Dashboard** — seletor de mês; KPIs de fluxo de caixa: **entradas, saídas, saldo do mês** (real vs. orçado) e **ritmo** das saídas (% do orçamento consumido vs. % do mês decorrido); feed de classificadas pelo LLM com dropdown de correção; barras real vs. orçado por categoria (entradas e saídas); gráfico de evolução (6 meses). Layout com sidebar de navegação.
2. **Transações** — tabela com filtros (mês, conta, categoria, texto), edição de categoria inline, toggle para ignoradas/receitas.
3. **Orçamento** — edição de valores mensais por categoria, organizado como fluxo de caixa (entradas no topo, saídas abaixo, saldo líquido projetado); histórico real vs. orçado mês a mês.
4. **Importar** — upload com resumo pós-importação; histórico de lotes com desfazer. (Fase 2: botão Sincronizar Pluggy.)
5. **Configurações** — categorias (criar/renomear/arquivar/cor), contas (adicionar/editar), regras de classificação (ver/editar), chave da API e **escolha do modelo LLM**.

Mockups do brainstorming preservados em `.superpowers/brainstorm/`.

## Tratamento de Erros

- **Arquivo inválido**: importação atômica; mensagem de erro aponta a linha/causa; nenhum estado parcial.
- **API Claude indisponível/sem chave**: transações entram "a classificar" (visíveis no dashboard); botão "Reclassificar pendentes" tenta de novo. O LLM é acessório — nunca bloqueia a importação.
- **Resposta malformada do LLM**: validação do JSON; categoria inexistente → fica "a classificar". Nunca inventar categoria.
- **Desfazer importação**: remove as transações do lote; regras criadas por correções permanecem.

## Testes

- **Parsers**: unitários com fixtures OFX/CSV reais do Bradesco e do Inter (anonimizadas) — encoding, datas, parcelas, deduplicação.
- **Regras/normalização**: unitários determinísticos.
- **LLM**: atrás de interface; testes usam respostas gravadas (sem custo/flakiness).
- **API**: integração dos endpoints com SQLite em memória (importação, orçamento, correção→regra).
- **Frontend**: testes dos cálculos de exibição (ritmo, agregações); validação manual do restante.

## Fora de Escopo (por enquanto)

- Módulo de acompanhamento de investimentos (carteira, rentabilidade) — os **aportes** já contam no fluxo de caixa como categoria de saída "Investimentos"
- Multiusuário, autenticação (app local, usuário único)
- Sincronização automática agendada (botão manual basta para uso sob demanda)
- Hierarquia de categorias
- Deploy em servidor/nuvem
