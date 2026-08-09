# Design: redesign completo do frontend

**Data:** 2026-08-09
**Status:** aprovado
**Fonte de verdade visual:** `design_handoff_frontend_redesign/README.md` + os 6 `.dc.html`

Este documento **não repete** a spec visual do handoff — ele registra as decisões tomadas
ao reconciliar aquele handoff com o estado real do `main`, e o fatiamento em planos. Para
cores, tipografia, espaçamentos e copy, o handoff é a referência.

---

## Objetivo

Redesenhar as 6 telas em dark mode, densidade compacta, IBM Plex Sans/Mono, accent teal,
para responder **"quais categorias estão queimando dinheiro?"** em 5 segundos e separar
**investimento** de despesa em todo o produto.

## Reconciliação com o handoff

O handoff foi escrito lendo o branch `feature/frontend`. O `main` já avançou. Correções:

| Handoff afirma | Realidade no `main` | Consequência |
| --- | --- | --- |
| ⚠️ `Category.kind` não aceita `investimento`; PATCH não aceita `kind` | Aceita — `routers/meta.py:60,75-77`, `models.py:CATEGORY_KINDS`, `api/types.ts:8` | Item 1 de "mudanças no backend" **cancelado** |
| ⚠️ Tela de Tendências não existe | `pages/Trends.tsx` + `lib/trends.ts` + testes existem | Tendências é **redesign**, não feature nova |
| ⚠️ Precisa de endpoint agregado para Tendências | Resolvido por fan-out (`useSummaries`, `hooks.ts:37`) | Item 2 **cancelado** (otimização futura, não bloqueia) |
| Categorias `orcado > 0 && real == 0` talvez precisem de campo novo | Derivável de `summary.categorias` | Item 4 **cancelado** — filtro no frontend |
| Rotas `/transactions`, `/budget`, `/trends`, `/imports`, `/settings` | `/transacoes`, `/orcamento`, `/tendencias`, `/importar`, `/config` | **Rotas atuais preservadas** |
| Barra flutuante de Transações tem "Criar regra" | `classifier.py:92-96` já cria/atualiza a regra a cada correção de categoria | Botão **removido** do design — seria redundante e mentiria sobre o que já acontece |

Restou **uma** mudança de backend, tratada abaixo.

## Decisões

### 1. `ritmo` passa a ser medido em pontos percentuais

O KPI "Ritmo das saídas" mostra `−23 pts` = `(realizado/orçado × 100) − (dias_decorridos/dias_do_mês × 100)`.
Hoje `budget.py:71` devolve uma **razão** (`(real/orçado) / (dia/dias)`), consumida em
`KpiRow.tsx:49` como percentual.

`month_summary` passa a devolver:

- `ritmo`: a diferença em pontos (float, `None` quando não há orçamento de saídas);
- `dias`: `{ decorridos, no_mes }`.

Motivo de ficar no backend: o design usa a fração do mês em **três** lugares (barra de
progresso do header, marca de ritmo em toda barra de orçamento, legendas), e o backend já
tem a regra do clamp para mês passado/futuro (`budget.py:70`). Duplicar isso no frontend
espalharia a regra de negócio.

### 2. Recharts sai

`EvolutionChart` e `BridgeChart` são reescritos em CSS/SVG puro, como o design especifica
(donut com `conic-gradient`, barras em `div`, waterfall posicionado). A dependência
`recharts` é removida do `package.json`. `useThemeColors` (`ThemeContext.tsx:87-101`)
existe só para alimentar recharts e é removido junto.

### 3. Escopo é o que a API já suporta

Nada de endpoint novo além do `ritmo`/`dias`. Em particular:

- **Sem dry-run de import.** A lista staged mostra nome, badge do tipo e tamanho — nunca
  "33 novas" antes do POST. (O próprio handoff marca isso.)
- **Sem "Aplicar média"** em Tendências. O botão sai do header.
- **Sem categorização em lote.** A barra flutuante de Transações emite N `PATCH` — a
  invalidação global existente cuida do refresh.
- **`POST /classify/pending`** continua devolvendo só contadores; o card "Pendentes de
  classificação" mostra contadores, não lista.

### 4. Tema light fica, com os tokens da spec

A tabela dark→light do handoff é aplicada. As telas não foram desenhadas em light — o
risco é assumido; a estrutura é idêntica e só os valores mudam.

**Desvio documentado:** o handoff desenha o rodapé da sidebar como segmented de **dois**
itens (`escuro | claro`). O app tem três modos (`system | light | dark`,
`theme/theme.ts`). O rodapé vira um segmented de **três** itens (`auto | claro | escuro`)
— mesma linguagem visual, sem perder o modo automático.

**Desvio documentado 2:** `Dashboard.dc.html` traz um card "Último import" no rodapé da
sidebar, enquanto os outros 5 protótipos e o README trazem o toggle de tema. Vale o
README: **toggle de tema nas 6 telas**, sem card de último import.

### 5. Zero estilo inline em produção

Hoje 11 dos 16 arquivos de `src/` usam `style={{…}}`. Regra do handoff: tudo vira classe
ou variável CSS. Exceção admitida: valores **calculados em runtime** que não cabem em
token — largura de barra em `%`, `conic-gradient` do donut, posição do tick de ritmo,
cor vinda de `category.color`. Esses continuam inline, via CSS custom properties quando
possível (`style={{ "--fill": "63%" }}`).

### 6. CSS cresce em arquivo próprio por camada

`styles.css` (188 linhas hoje) vira:

- `styles/tokens.css` — `:root` / `[data-theme="dark"]`, fontes, reset;
- `styles/base.css` — elementos, tipografia, `.mono`, layout do shell;
- `styles/components.css` — primitivos (card, chip, pill, segmented, barra, input, botão);
- `styles/pages.css` — o que for irredutivelmente de uma tela.

Importados por `main.tsx` nessa ordem. Motivo: um arquivo único chegaria a ~1.200 linhas.

### 7. Fontes vêm do Google Fonts via `index.html`

`preconnect` + `<link>` para IBM Plex Sans (400/500/600/700) e IBM Plex Mono (400/500/600),
como o handoff especifica. O app é local; sem fallback offline além da stack
`system-ui, sans-serif` já declarada.

## Primitivos a construir (fundação)

Componentes React compartilhados, cada um exercitado por pelo menos duas telas:

| Componente | Usado em |
| --- | --- |
| `Segmented` | Dashboard (Risco/Valor, Mês/YTD/12m), Orçamento (ordenação), Configurações (kind, conta), sidebar (tema) |
| `MonthPicker` (reescrito no visual `‹ ago/26 ›`) | Dashboard, Transações, Orçamento |
| `PageHeader` (eyebrow + h1 + slot à direita) | as 6 telas |
| `Chip` / `Pill` | Transações, Configurações, Dashboard, Importar |
| `ProgressBar` (com marca de ritmo opcional) | Dashboard, Orçamento |
| `Money` (mono, com tom por sinal e `—` / `n/d`) | as 6 telas |

## Estados de ausência de dado

Regra do handoff, aplicada em todo lugar via `Money`:

- `—` em `--muted`: valor **zero**;
- `n/d` itálico `--muted-2`: dado **não existe**; fica fora de médias e comparativos;
- borda/barra **tracejada**: **orçado, não realizado**.

## Fatiamento em planos

Cada plano produz software funcionando e comitável. A ordem entrega valor cedo: Dashboard
e Transações concentram a tese do redesign.

| Plano | Escopo | Depende de |
| --- | --- | --- |
| **00 — Fundação** | `ritmo`/`dias` no backend, tokens, fontes, shell/sidebar, primitivos compartilhados | — |
| **01 — Dashboard** | KPIs, feed do LLM, "onde queima", donut, 6 meses, orçado-não-realizado, bridge; recharts sai | 00 |
| **02 — Transações** | filtros, agrupamento por dia, chip de categoria, seleção múltipla + barra flutuante | 00 |
| **03 — Orçamento** | KPIs, duas colunas, rail sticky, "como o mês fecha", histórico | 00 |
| **04 — Tendências** | header, KPIs, sparklines, chips de desvio, passado vs. futuro | 00 |
| **05 — Importar** | fluxo numerado, dropzone, resultado, histórico | 00 |
| **06 — Configurações** | modelo LLM, categorias por kind, rail de contas, regras | 00 |

Durante os planos 01–06 as telas ainda não migradas continuam funcionando com os tokens
novos (herdam cores e tipografia), visualmente inconsistentes mas utilizáveis. Isso é
aceito: o app é de uso pessoal e cada plano fecha em poucos commits.

Os planos 01–06 são escritos **um por vez, imediatamente antes de executar cada um** —
escrever os seis agora produziria código que envelhece contra os primitivos reais criados
no plano 00.

## Testes

- **Backend:** pytest para o novo `ritmo` em pontos e o bloco `dias` (mês corrente, mês
  passado, mês futuro, sem orçamento).
- **Frontend:** vitest para toda lógica pura nova (ordenação por risco, fatias do donut,
  agrupamento por dia, cálculo do waterfall). Componentes visuais não ganham teste
  unitário — o repo não tem testing-library instalado e a verificação é visual.
- **Visual:** Playwright (skill `webapp-testing`) ao final de cada plano, com screenshot
  da tela em dark e light.
- **Revisão:** uma revisão de código ao final de cada plano (preferência do usuário: sem
  revisor por task).
