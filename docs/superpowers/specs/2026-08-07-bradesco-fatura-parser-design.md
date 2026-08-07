# Parser de fatura Bradesco (cartão de crédito) — Design

**Data:** 2026-08-07
**Status:** aprovado

## Objetivo

Permitir importar o CSV de fatura de cartão de crédito do Bradesco (ex.:
`Bradesco_872026_122833 AM.csv`) pelo fluxo de upload existente
(`POST /api/imports`), sem nenhum passo manual extra. O parser CSV genérico
atual não lê esse arquivo (encoding latin-1 com quebras CR-only, datas sem
ano, coluna `Valor(US$)` capturada no lugar de `Valor(R$)`, múltiplos blocos
de cartão, sinal invertido).

## Formato do arquivo

- Encoding ISO-8859-1 (latin-1), linhas terminadas apenas em `\r`.
- Cabeçalho: `Data: dd/mm/yyyy hh:mm:ss`, depois `Situação da Fatura: ...`.
- Um ou mais blocos de cartão, cada um iniciado por
  `NOME DO TITULAR ;;; <final do cartão>` seguido do header
  `Data;Histórico;Valor(US$);Valor(R$);`.
- Linhas de transação: `dd/mm;DESCRIÇÃO [N/M];valor_usd;valor_brl` —
  data sem ano, valores em formato brasileiro (`1234,56`), despesas com
  sinal positivo, pagamentos/créditos com sinal negativo. Parcelas aparecem
  como sufixo `N/M` na descrição.
- Linhas especiais dentro do bloco: `SALDO ANTERIOR` e
  `PAGTO. POR DEB EM C/C`.
- Rodapé: `Total da fatura em Real`, `Resumo das Despesas`, tabela de taxas.

## Decisões

1. **Cartões:** todos os blocos (finais distintos) vão para a única conta
   escolhida no upload. Não separamos contas por final de cartão.
2. **Detecção:** automática, por sniffing do conteúdo. O usuário continua só
   arrastando o arquivo.
3. **Linhas especiais:** `SALDO ANTERIOR` nunca é importado (não é
   transação). O pagamento da fatura (`PAGTO. POR DEB EM C/C`) é importado
   normalmente; o ignore pattern existente `PAGTO POR DEB`
   (`services/importer.py`) o marca como `ignored` no import.

## Componentes

### 1. `backend/app/parsers/bradesco_fatura.py` (novo)

- `sniff(content: bytes) -> bool`: detecção barata da assinatura do formato —
  presença de `Valor(US$);Valor(R$)` e de `Situação da Fatura` (ou
  `Total da fatura`) no conteúdo decodificado.
- `parse_bradesco_fatura(content: bytes) -> list[ParsedTransaction]`:
  - Decodifica utf-8-sig com fallback latin-1 (latin-1 nunca falha, então
    precisa ser o fallback) e normaliza `\r`/`\r\n` para `\n`.
  - Extrai a data da fatura do cabeçalho `Data: dd/mm/yyyy` — referência para
    inferência de ano.
  - Considera transação apenas linhas casando `^\d{2}/\d{2};`; todo o resto
    (headers de bloco, headers de coluna repetidos, rodapé, taxas) é pulado.
  - Pula explicitamente linhas cuja descrição normalizada é `SALDO ANTERIOR`.
  - **Ano inferido:** o mais recente tal que a data resultante seja ≤ data da
    fatura (ex.: fatura 07/08/2026 → `04/08` = 2026, `28/10` = 2025).
  - **Valor:** sempre a última coluna (`Valor(R$)`), convertida com a mesma
    semântica de `_to_cents` do parser genérico; sinal invertido
    (despesa positiva → `amount_cents` negativo; crédito/pagamento negativo →
    positivo).
  - **Parcelas:** a descrição é mantida como está; `extract_installment`
    (`normalize.py`) já reconhece o sufixo `N/M` no fluxo de import.
  - **Data de parcelas (decisão de 2026-08-07):** nas linhas parceladas a
    fatura mostra a data da compra original, mas a cobrança pertence ao
    ciclo desta fatura. Parcelas com data fora da janela das linhas
    regulares (não-parceladas) do arquivo são datadas no **início do
    ciclo** (menor data regular); parcelas dentro da janela mantêm a data.
    Arquivo sem linhas regulares não tem âncora: datas ficam como estão.
  - **fitid determinístico:** `bradesco-fatura|<date>|<desc>|<amount>|<n>`,
    onde `<n>` é o índice de ocorrência da tripla (data, descrição, valor)
    dentro do arquivo. Evita colisão de dedupe entre duas compras idênticas
    no mesmo dia e mantém deduplicação estável entre reimportações do mesmo
    período.
  - Arquivo com assinatura mas sem nenhuma linha de transação válida →
    `ValueError` (mesmo contrato do parser genérico).

### 2. `backend/app/parsers/__init__.py` (alterado)

Em `parse_file`, para `.csv`: se `bradesco_fatura.sniff(content)`, usa o novo
parser; senão, cai no `parse_csv` genérico como hoje. Nenhuma mudança de
assinatura pública, rota ou frontend.

## Fluxo de dados

Upload → `parse_file` (sniff → parser Bradesco) → `import_file` (normaliza,
extrai parcela, dedupe por fitid, aplica ignore patterns/rules, persiste no
`ImportBatch`) → classificação (regras → LLM). Nada muda a jusante do parser.

## Tratamento de erros

- CSV com assinatura Bradesco mas ilegível/vazio → `ValueError` → HTTP 400 no
  router de imports (comportamento existente).
- Linha de transação malformada (colunas faltando, valor inválido) → pulada
  silenciosamente, como no parser genérico.
- Cabeçalho `Data:` ausente → `ValueError` (sem referência de ano não há
  como datar as transações com segurança).

## Testes

`backend/tests/test_parsers_bradesco_fatura.py`, no estilo de
`test_parsers_csv.py` (fixtures inline em bytes latin-1 com CR-only):

- inferência de ano (mesmo ano e ano anterior);
- uso da coluna `Valor(R$)` quando `Valor(US$)` é não-zero;
- inversão de sinal (despesa e pagamento);
- múltiplos blocos de cartão no mesmo arquivo;
- `SALDO ANTERIOR` pulado;
- fitids distintos para duas compras idênticas no mesmo dia, e estáveis
  entre dois parses do mesmo conteúdo;
- sniff: fatura Bradesco detectada; CSV genérico continua no parser antigo;
- arquivo com assinatura e zero transações → `ValueError`.

## Fora de escopo

- Separar contas por final de cartão.
- Usar a cotação do dólar / valores em US$.
- Importar resumo, taxas ou total da fatura.
- Detecção por institution/kind da conta.
