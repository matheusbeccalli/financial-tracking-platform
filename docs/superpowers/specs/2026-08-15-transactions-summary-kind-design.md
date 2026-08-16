# Design: resumo de Transações ciente de kind (item A1 dos deferidos)

**Data:** 2026-08-15
**Status:** aprovado

## Problema

"Entradas" significa coisas diferentes em duas telas: o strip de Transações
(`summarize`, `frontend/src/lib/txTable.ts`) soma por **sinal do valor**, enquanto o
Dashboard (`month_summary`, `backend/app/services/budget.py`) soma por **kind da
categoria**. Caso registrado: um resgate de investimento de R$ 50,48 aparece como
"Entradas R$ 50,48" em Transações e "R$ 0,00" no Dashboard, para o mesmo mês.

## Decisão

`summarize` passa a espelhar exatamente a semântica do backend.

**Assinatura:** `summarize(txs, kindById)`, onde `kindById` é um
`Map<number, CategoryKind>` derivado de `useCategories` (a tela já carrega as
categorias). O módulo continua puro.

**Regras por transação (não ignorada):**

| Situação | Efeito |
| --- | --- |
| Categoria kind `entrada` | `entradas += amount_cents` com sinal (estorno reduz) |
| Categoria kind `investimento` | `investido += -amount_cents` (positivo = aporte líquido) |
| Categoria kind `saida` | `saidas += -amount_cents` |
| Sem categoria ou id fora do mapa | por sinal: positivo → `entradas`, negativo → `saidas` (como `uncat_in`/`uncat_out` no backend) |

Ignoradas ficam fora de tudo, como hoje. Ids fora do mapa cobrem também o instante em
que as categorias ainda não carregaram — o strip degrada para o comportamento atual.

**Saldo:** `entradas − saidas − investido` ≡ soma bruta dos amounts = variação real de
caixa. Numericamente idêntico ao saldo de hoje; só Entradas/Saídas/Investido se
redistribuem.

**Strip (`TotalsStrip`):** `TxSummary` ganha `investido`; o strip passa a **4 colunas
fixas** — Entradas · Saídas · Investido · Saldo. `Money` mostra `—` quando zero;
investido negativo (resgate líquido) é sempre tom `--over` (regra do projeto: negativo
nunca leva o tom da categoria).

## Alternativa rejeitada

Coluna "Investido" condicional (só quando o filtro contém transação de investimento):
layout pularia ao trocar filtro/mês; a coluna fixa usa a mesma linguagem do tile
"Investido" do Dashboard.

## Item vizinho cortado (A4)

O filtro "sem categoria" em Transações **já existe** (chip na FilterBar); o gap real era
os links de Importar/Dashboard não pré-aplicarem o filtro via query param. Decisão do
usuário (2026-08-15): cortar — clicar no chip manualmente é aceitável.

## Testes

Vitest em `lib/txTable`: um caso por kind, estorno em categoria de entrada,
sem-categoria por sinal, id desconhecido, e o caso registrado (resgate → Entradas
R$ 0,00, Investido −R$ 50,48).
