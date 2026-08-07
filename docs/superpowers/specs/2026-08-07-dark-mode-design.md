# Dark mode para o frontend — Design

**Data:** 2026-08-07
**Status:** Aprovado

## Objetivo

Adicionar dark mode ao frontend React (Vite), seguindo a preferência do sistema por padrão, com toggle manual persistido. Escopo restrito ao frontend; nenhuma mudança no backend.

## Comportamento

- **Modos:** `system` (padrão), `light`, `dark`. O modo `system` resolve para claro ou escuro via `prefers-color-scheme` e acompanha mudanças do SO em tempo real.
- **Controle:** botão no rodapé da sidebar, ciclando `system → light → dark → system`, com rótulo indicando o modo atual.
- **Persistência:** escolha manual salva em `localStorage` (chave `theme`). `system` é o estado quando não há chave salva (ou valor inválido).
- **Sem flash:** script inline no `index.html` aplica `data-theme` no `<html>` antes do React montar.

## Arquitetura

### 1. CSS (`src/styles.css`)

O tema claro permanece como está em `:root`. Um bloco `:root[data-theme="dark"]` redefine as mesmas variables com a paleta escura, mantendo o tom levemente quente:

- Fundos: `--page: #121210`, `--surface: #1a1a18`
- Tinta: `--ink` claro, `--ink-2`/`--muted` em cinzas quentes claros
- `--grid`/`--baseline`/`--border` em versões escuras de baixo contraste
- Azuis mais luminosos (`--blue`, `--blue-dark`, `--blue-100` vira fundo azul escuro para o link ativo), `--good`/`--critical`/`--red` ajustados para legibilidade em fundo escuro

Cores fixas existentes viram variables novas (definidas nos dois temas):

- `--input-bg` (hoje `background: #fff` em `select, input`)
- `--warn-bg` / `--warn-border` (hoje hardcoded no card de alerta do `LlmFeed.tsx`)

Também setar `color-scheme: light`/`dark` conforme o tema, para que scrollbars e controles nativos acompanhem.

### 2. `src/theme/ThemeContext.tsx` (novo)

- `ThemeProvider` com estado `mode: "system" | "light" | "dark"` e `resolved: "light" | "dark"`.
- Aplica `data-theme={resolved}` no `document.documentElement`; persiste `mode` em `localStorage` (remove a chave quando `system`).
- Escuta `matchMedia("(prefers-color-scheme: dark)")` quando em `system`.
- Lógica pura extraída em `src/theme/theme.ts`: `resolveTheme(mode, systemPrefersDark)` e `nextMode(mode)` — testáveis sem DOM.
- Hook `useTheme()` expõe `{ mode, resolved, cycle }`.

### 3. `useThemeColors()` (em `src/theme/ThemeContext.tsx`)

Recharts seta cores como atributos SVG, que não resolvem `var()` de forma confiável. O hook lê as variables computadas (`getComputedStyle(document.documentElement)`) e devolve `{ muted, baseline, blue, blueDark, red }`, recalculando quando `resolved` muda. O CSS permanece a única fonte de verdade das cores.

### 4. Componentes

- **`Layout.tsx`:** botão de tema no rodapé da sidebar usando `useTheme()`.
- **`BridgeChart.tsx` / `EvolutionChart.tsx`:** substituir hexes hardcoded pelas cores de `useThemeColors()`.
- **`LlmFeed.tsx`:** trocar `style` inline hardcoded por classe `.card.warn` usando `--warn-bg`/`--warn-border`.
- **`main.tsx`:** envolver a app com `ThemeProvider`.
- **`index.html`:** script inline anti-flash (lê `localStorage.theme`, cai para `matchMedia`).

## Tratamento de erros

- `localStorage` indisponível (modo privado etc.): try/catch, cai para `system`.
- Valor inválido em `localStorage.theme`: tratado como `system`.

## Testes

- `src/theme/theme.test.ts` (Vitest, padrão dos testes de `lib/`): `resolveTheme` para as 6 combinações de modo × preferência do sistema; `nextMode` cicla corretamente; parsing de valor persistido inválido.
- Verificação visual das telas nos dois temas via skill de webapp-testing (screenshots).

## Fora de escopo

- Preferência de tema por usuário no backend.
- Transições animadas entre temas.
- Controle de tema duplicado na tela de Settings.
