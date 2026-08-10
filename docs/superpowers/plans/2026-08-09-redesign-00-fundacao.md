# Redesign — Plano 00: Fundação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a base visual do app pela do redesign — tokens, fontes, shell/sidebar e os primitivos compartilhados — e ajustar o único ponto de backend que o design exige (`ritmo` em pontos percentuais + dias do mês), deixando as 6 telas ainda funcionando enquanto migram uma a uma nos planos 01–06.

**Architecture:** `styles.css` (188 linhas, light-first, paleta azul) é substituído por quatro arquivos em `src/styles/` — `tokens.css`, `base.css`, `components.css`, `pages.css` — importados em ordem por `main.tsx`. As telas ainda não migradas continuam funcionando por uma seção "legado" em `pages.css` que preserva as classes antigas e mapeia os tokens velhos (`--blue`, `--grid`, `--good`, …) para os novos via `var()`. Os primitivos (`Segmented`, `PageHeader`, `Money`, `Chip`, `Pill`, `ProgressBar`, `MonthPicker`) entram como componentes em `src/components/`, cada um com CSS em `components.css`. No backend, `month_summary` passa a devolver `ritmo` em pontos percentuais e um bloco `dias`.

**Tech Stack:** React 19 + TypeScript + Vite + TanStack Query, CSS puro com variáveis; FastAPI + pytest no backend. Sem dependências novas — `recharts` continua instalado neste plano e sai no plano 01.

**Spec:** `docs/superpowers/specs/2026-08-09-frontend-redesign-design.md`
**Referência visual:** bundle de handoff local (não versionado) — ver a spec acima

**Baseline antes de começar:** frontend 41 testes, backend 108 testes (em `64733f3`), ambos
verdes.

---

### Task 1: `ritmo` em pontos percentuais e bloco `dias` (backend)

**Files:**
- Modify: `backend/app/services/budget.py:69-99`
- Test: `backend/tests/test_budget.py`

Hoje `month_summary` devolve `ritmo` como razão (`(real/orçado) / (dia/dias_mês)`). O design mostra `−23 pts` = `(real/orçado × 100) − (decorrido/dias_mês × 100)`, e usa a fração do mês em mais três lugares. Além disso, o clamp atual trata **mês futuro** como mês inteiro decorrido (`dia = end.day`), o que faria a barra "dia 30 de 30" num mês que nem começou — passa a ser `0`.

- [ ] **Step 1.1: Ajustar o teste existente e escrever os novos**

Em `backend/tests/test_budget.py`, substituir as duas linhas 55-56:

```python
    # ritmo agora só olha saídas de consumo: (124000/150000) / (15/31)
    assert abs(s["ritmo"] - (124000 / 150000) / (15 / 31)) < 0.001
```

por:

```python
    # ritmo em pontos percentuais: % do orçado consumido − % do mês decorrido
    assert abs(s["ritmo"] - ((124000 / 150000) * 100 - (15 / 31) * 100)) < 0.001
    assert s["dias"] == {"decorridos": 15, "no_mes": 31}
```

E acrescentar, ao final do arquivo, dois testes novos:

```python
def test_ritmo_negativo_significa_folga(session):
    mercado = cat(session, "Mercado")
    session.add(Budget(category_id=mercado.id, amount_cents=150000, valid_from="2026-01"))
    session.flush()
    add_tx(session, mercado.id, -15000)  # 10% do orçado
    s = month_summary(session, "2026-08", today=date(2026, 8, 16))  # ~51,6% do mês
    assert s["ritmo"] < 0
    assert abs(s["ritmo"] - (10.0 - (16 / 31) * 100)) < 0.001


def test_dias_em_mes_passado_e_futuro(session):
    passado = month_summary(session, "2026-07", today=date(2026, 8, 15))
    assert passado["dias"] == {"decorridos": 31, "no_mes": 31}
    futuro = month_summary(session, "2026-09", today=date(2026, 8, 15))
    assert futuro["dias"] == {"decorridos": 0, "no_mes": 30}
```

- [ ] **Step 1.2: Rodar e ver falhar**

Run: `cd backend && .venv/bin/python -m pytest tests/test_budget.py -q`
Expected: FAIL — `KeyError: 'dias'` nos três testes e valor de `ritmo` fora da tolerância.

- [ ] **Step 1.3: Implementar**

Em `backend/app/services/budget.py`, substituir o bloco das linhas 69-73:

```python
    if saidas_orc > 0:
        dia = today.day if start <= today <= end else end.day
        ritmo = (saidas_real / saidas_orc) / (dia / end.day)
    else:
        ritmo = None
```

por:

```python
    # Dias decorridos do mês de referência: 0 se o mês ainda não começou,
    # mês inteiro se já terminou.
    if today < start:
        decorridos = 0
    elif today > end:
        decorridos = end.day
    else:
        decorridos = today.day

    # Ritmo em pontos percentuais: quanto do orçado já foi consumido menos
    # quanto do mês já passou. Negativo = folga.
    if saidas_orc > 0:
        ritmo = (saidas_real / saidas_orc) * 100 - (decorridos / end.day) * 100
    else:
        ritmo = None
```

E, no dicionário de retorno (linha ~97), acrescentar a chave `dias` logo depois de `ritmo`:

```python
        "ritmo": ritmo,
        "dias": {"decorridos": decorridos, "no_mes": end.day},
```

- [ ] **Step 1.4: Rodar e ver passar**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: `110 passed` (108 anteriores + 2 novos).

- [ ] **Step 1.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add backend/app/services/budget.py backend/tests/test_budget.py
git commit -m "feat(api): ritmo em pontos percentuais e dias do mes no summary"
```

---

### Task 2: Frontend acompanha o novo contrato do summary

**Files:**
- Modify: `frontend/src/api/types.ts:43-51`
- Modify: `frontend/src/components/dashboard/KpiRow.tsx:10,47-52`
- Modify: `frontend/src/lib/trends.test.ts:126-145`

O `KpiRow` atual multiplica `ritmo` por 100 e compara com `1` — semântica antiga. Ajuste mínimo aqui; o KPI ganha o visual do design no plano 01.

- [ ] **Step 2.1: Tipos**

Em `frontend/src/api/types.ts`, acrescentar a interface antes de `Summary`:

```ts
export interface Dias {
  decorridos: number;
  no_mes: number;
}
```

E, dentro de `interface Summary`, substituir a linha `ritmo: number | null;` por:

```ts
  /** Pontos percentuais: % do orçado consumido − % do mês decorrido. Negativo = folga. */
  ritmo: number | null;
  dias: Dias;
```

- [ ] **Step 2.2: `KpiRow` lê pontos**

Em `frontend/src/components/dashboard/KpiRow.tsx`, substituir a linha 10:

```tsx
  const acima = s.ritmo !== null && s.ritmo > 1;
```

por:

```tsx
  const acima = s.ritmo !== null && s.ritmo > 0;
```

E substituir o `StatTile` de "Ritmo das saídas" (linhas 47-52) por:

```tsx
      <StatTile
        label="Ritmo das saídas"
        value={
          s.ritmo === null
            ? "—"
            : `${s.ritmo > 0 ? "+" : s.ritmo < 0 ? "−" : ""}${Math.abs(Math.round(s.ritmo))} pts`
        }
        sub={
          s.ritmo === null
            ? "sem orçamento"
            : `gastou ${Math.round((s.saidas.real / s.saidas.orcado) * 100)}% do orçado com ${Math.round((s.dias.decorridos / s.dias.no_mes) * 100)}% do mês corrido`
        }
        tone={acima ? "bad" : undefined}
      />
```

- [ ] **Step 2.3: Helper de teste do trends aceita o campo novo**

Em `frontend/src/lib/trends.test.ts`, dentro de `mkSummary`, no objeto retornado, acrescentar a linha `dias` logo abaixo de `ritmo: null,`:

```ts
    ritmo: null,
    dias: { decorridos: 0, no_mes: 30 },
```

- [ ] **Step 2.4: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: tsc limpo; `41 passed`.

- [ ] **Step 2.5: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/api/types.ts frontend/src/components/dashboard/KpiRow.tsx frontend/src/lib/trends.test.ts
git commit -m "feat(ui): consume ritmo in points and month days"
```

---

### Task 3: Fontes, tokens e divisão do CSS

**Files:**
- Modify: `frontend/index.html`
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/base.css`
- Create: `frontend/src/styles/components.css`
- Create: `frontend/src/styles/pages.css`
- Delete: `frontend/src/styles.css`
- Modify: `frontend/src/main.tsx:6`

- [ ] **Step 3.1: Fontes no `index.html`**

Em `frontend/index.html`, dentro do `<head>`, logo antes de `<title>`, acrescentar:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
```

O script inline de tema (linhas 7-14) fica como está — ele já grava `data-theme` antes da primeira pintura.

- [ ] **Step 3.2: Criar `tokens.css`**

Create `frontend/src/styles/tokens.css`:

```css
/* Tokens do redesign. O tema escuro é o desenhado; o claro troca apenas os valores,
   nunca a estrutura — mesmos raios, mesma escala tipográfica, mesmo espaçamento.
   No claro, accent/warn são escurecidos até ≥ 4.5:1 sobre --surface, o que vale tanto
   para texto quanto para fundo de botão preenchido. */

:root {
  color-scheme: light;

  --page: #f9f9f7;
  --sidebar: #f4f4f1;
  --surface: #ffffff;
  --surface-2: #f4f4f1;

  --ink: #0b0b0b;
  --ink-2: #52514e;
  --muted: #898781;
  --muted-2: #a3a19a;

  --border: rgba(11, 11, 11, 0.1);
  --border-strong: rgba(11, 11, 11, 0.16);
  --divider: rgba(11, 11, 11, 0.07);
  --track: #e1e0d9;

  --accent: #178f8e;
  --warn: #9a7112;
  --over: #c0392b;
  --invest: #4550c4;
  --pace-mark: rgba(11, 11, 11, 0.35);

  --tint-accent: rgba(23, 143, 142, 0.07);
  --tint-warn: rgba(154, 113, 18, 0.07);
  --tint-over: rgba(192, 57, 43, 0.07);
  --tint-invest: rgba(69, 80, 196, 0.07);

  --nav-active: rgba(23, 143, 142, 0.12);
  --nav-dot: rgba(11, 11, 11, 0.2);
  --seg-active: #ffffff;
  --hover-row: rgba(11, 11, 11, 0.03);
  --hover-ghost: rgba(11, 11, 11, 0.04);
  --focus: rgba(23, 143, 142, 0.55);
  --focus-invest: rgba(69, 80, 196, 0.55);

  --float-bg: #ffffff;
  --float-border: rgba(11, 11, 11, 0.16);
  --shadow-float: 0 12px 32px rgba(11, 11, 11, 0.18);
}

:root[data-theme="dark"] {
  color-scheme: dark;

  --page: #0d0e10;
  --sidebar: #111316;
  --surface: #15171a;
  --surface-2: #0f1114;

  --ink: #edeceb;
  --ink-2: #a9adb4;
  --muted: #6f757e;
  --muted-2: #585e66;

  --border: rgba(255, 255, 255, 0.07);
  --border-strong: rgba(255, 255, 255, 0.1);
  --divider: rgba(255, 255, 255, 0.05);
  --track: rgba(255, 255, 255, 0.07);

  --accent: #4fd0cf;
  --warn: #d9b04f;
  --over: #e2705f;
  --invest: #9aa6f2;
  --pace-mark: rgba(255, 255, 255, 0.4);

  --tint-accent: rgba(79, 208, 207, 0.05);
  --tint-warn: rgba(217, 176, 79, 0.05);
  --tint-over: rgba(226, 112, 95, 0.05);
  --tint-invest: rgba(154, 166, 242, 0.05);

  --nav-active: rgba(79, 208, 207, 0.1);
  --nav-dot: rgba(255, 255, 255, 0.18);
  --seg-active: rgba(255, 255, 255, 0.09);
  --hover-row: rgba(255, 255, 255, 0.035);
  --hover-ghost: rgba(255, 255, 255, 0.04);
  --focus: rgba(79, 208, 207, 0.55);
  --focus-invest: rgba(154, 166, 242, 0.55);

  --float-bg: #1b1e22;
  --float-border: rgba(255, 255, 255, 0.14);
  --shadow-float: 0 12px 32px rgba(0, 0, 0, 0.45);
}

/* Tokens que não mudam com o tema. Fica depois dos blocos de cor de propósito:
   o seletor [data-theme] tem especificidade maior, então as cores continuam
   vencendo independentemente da ordem. */
:root {
  --font-ui: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;

  --r-card: 12px;
  --r-control: 8px;
  --r-btn: 7px;
  --r-seg: 5px;
  --r-badge: 4px;
  --r-pill: 99px;

  --gap-section: 14px;
}
```

- [ ] **Step 3.3: Criar `base.css`**

Create `frontend/src/styles/base.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 13px;
  background: var(--page);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--accent);
  text-decoration: none;
}

/* Regra do sistema: todo valor monetário, percentual, data e id usa mono —
   é o que alinha as colunas de valor. */
.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

h1 {
  margin: 3px 0 0;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

h3 {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-2);
}

.eyebrow {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.09em;
}

.label {
  font-size: 10px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.09em;
}

.sub {
  font-size: 11.5px;
  color: var(--muted);
}

.note {
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.5;
}

.muted {
  color: var(--muted);
}

.error {
  color: var(--over);
  font-size: 12.5px;
}

/* Shell — sidebar de 212px fixos + área principal. Desktop-only. */
.app {
  display: grid;
  grid-template-columns: 212px 1fr;
  min-height: 100vh;
}

.sidebar {
  background: var(--sidebar);
  border-right: 1px solid var(--border);
  padding: 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 8px;
}

.brand-mark {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--accent);
}

.brand-name {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.nav a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--r-btn);
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-2);
  transition: background 150ms ease, color 150ms ease;
}

.nav a:hover {
  background: var(--hover-ghost);
  color: var(--ink);
}

.nav a.active {
  background: var(--nav-active);
  color: var(--ink);
}

.nav-dot {
  width: 5px;
  height: 5px;
  border-radius: var(--r-pill);
  background: var(--nav-dot);
}

.nav a.active .nav-dot {
  background: var(--accent);
}

.sidebar-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--r-control);
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--ink-2);
}

.main {
  padding: 20px 26px 60px;
  max-width: 1440px;
  min-width: 0;
}

/* Tendências precisa da largura toda para a matriz de meses. */
.main--wide {
  max-width: none;
}
```

- [ ] **Step 3.4: Criar `components.css`**

Create `frontend/src/styles/components.css`:

```css
/* Primitivos compartilhados. Nada aqui pode depender de uma tela específica. */

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 16px 18px;
  margin-bottom: var(--gap-section);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

/* Cabeçalho de página: eyebrow + h1 à esquerda, controles à direita. */
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 18px;
}

.page-header-aside {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-sub {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.5;
  max-width: 78ch;
}

/* Segmented control */
.seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-btn);
}

.seg-item {
  font: inherit;
  font-size: 11px;
  padding: 3px 9px;
  border: 0;
  border-radius: var(--r-seg);
  background: none;
  color: var(--muted);
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}

.seg-item:hover {
  color: var(--ink-2);
  background: none;
}

.seg-item.is-active {
  background: var(--seg-active);
  color: var(--ink);
}

/* Seletor de mês: ‹ ago/26 › */
.month-picker {
  display: inline-flex;
  align-items: stretch;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-control);
  overflow: hidden;
}

.month-picker button {
  font: inherit;
  font-size: 13px;
  line-height: 1;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--ink-2);
  padding: 5px 9px;
  cursor: pointer;
}

.month-picker button:hover {
  background: var(--hover-ghost);
  color: var(--ink);
}

.month-picker .month-label {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  padding: 4px 10px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  border-left: 1px solid var(--border-strong);
  border-right: 1px solid var(--border-strong);
}

/* Chip (clicável) e Pill (rótulo) */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  padding: 3px 9px;
  border-radius: var(--r-pill);
  background: var(--hover-ghost);
  border: 1px solid transparent;
  color: var(--ink-2);
}

button.chip {
  font-family: inherit;
  cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease;
}

button.chip:hover {
  border-color: var(--border-strong);
  background: var(--hover-ghost);
  color: var(--ink);
}

.chip.is-active {
  background: var(--nav-active);
  color: var(--ink);
}

.pill {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: var(--r-pill);
  border: 1px solid currentColor;
}

/* Borda tracejada é semântica: "sem valor definido" ou "previsto, não realizado". */
.pill.dashed {
  border-style: dashed;
}

/* Tons — aplicados via `color`, para que barras e bordas herdem com currentColor. */
.tone-accent {
  color: var(--accent);
}
.tone-warn {
  color: var(--warn);
}
.tone-over {
  color: var(--over);
}
.tone-invest {
  color: var(--invest);
}
.tone-ink {
  color: var(--ink);
}
.tone-ink-2 {
  color: var(--ink-2);
}
.tone-muted {
  color: var(--muted);
}

/* Valor monetário */
.money {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

/* Zero é "—" cinza; dado inexistente é "n/d" itálico — coisas diferentes. */
.money.is-zero {
  color: var(--muted);
}

.money.is-nd {
  color: var(--muted-2);
  font-style: italic;
  font-family: var(--font-ui);
}

/* Barra de progresso com marca de ritmo */
.bar {
  position: relative;
  width: 100%;
  background: var(--track);
  border-radius: var(--r-pill);
  overflow: hidden;
}

.bar-value {
  height: 100%;
  border-radius: var(--r-pill);
  background: currentColor;
}

.bar-value.dashed {
  background: none;
  border: 1px dashed currentColor;
}

.bar-pace {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--pace-mark);
}

/* Controles */
input,
select,
textarea {
  font-family: inherit;
  font-size: 12.5px;
  color: var(--ink);
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-btn);
  padding: 5px 8px;
}

input:focus,
select:focus,
textarea:focus {
  outline: none;
  border-color: var(--focus);
  border-style: solid;
}

input.dashed {
  border-style: dashed;
}

input.mono {
  font-family: var(--font-mono);
}

input.invest:focus {
  border-color: var(--focus-invest);
}

button {
  font-family: inherit;
  font-size: 12.5px;
  padding: 5px 11px;
  border-radius: var(--r-btn);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--ink-2);
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}

button:hover {
  background: var(--hover-ghost);
  color: var(--ink);
}

button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--page);
}

button.primary:hover {
  background: var(--accent);
  color: var(--page);
  filter: brightness(1.08);
}

button.ghost {
  border-color: transparent;
  background: none;
}

button.danger:hover {
  color: var(--over);
}

button:disabled {
  background: var(--hover-ghost);
  border-color: transparent;
  color: var(--muted);
  cursor: default;
}

button:disabled:hover {
  background: var(--hover-ghost);
  color: var(--muted);
  filter: none;
}

/* Toasts (comportamento inalterado, cores novas) */
.toasts {
  position: fixed;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 100;
  max-width: 360px;
}

.toast {
  background: var(--float-bg);
  color: var(--ink);
  border: 1px solid var(--over);
  border-left-width: 3px;
  border-radius: var(--r-control);
  padding: 10px 14px;
  font-size: 12.5px;
  box-shadow: var(--shadow-float);
  cursor: pointer;
  text-align: left;
  width: 100%;
  font-family: inherit;
}

.toast:hover {
  background: var(--float-bg);
  color: var(--ink);
}
```

- [ ] **Step 3.5: Criar `pages.css` com a seção legado**

Create `frontend/src/styles/pages.css`:

```css
/* Estilos de tela. Enquanto os planos 01–06 não rodam, este arquivo é quase todo
   a seção "legado" abaixo: as classes e tokens da versão anterior, remapeados para
   os tokens novos, para que as telas não migradas continuem utilizáveis.
   Cada plano de tela remove o pedaço legado que deixou de ser usado. */

/* ---------- LEGADO: aliases de tokens ---------- */
/* useThemeColors (ThemeContext.tsx) lê estes nomes para alimentar o recharts, que
   ainda vive em EvolutionChart/BridgeChart. Somem no plano 01. */
:root {
  --grid: var(--divider);
  --baseline: var(--border-strong);
  --blue: var(--accent);
  --blue-dark: var(--accent);
  --blue-100: var(--nav-active);
  --red: var(--over);
  --good: var(--accent);
  --critical: var(--over);
  --input-bg: var(--surface-2);
  --warn-bg: var(--tint-warn);
  --warn-border: var(--warn);
  --on-blue: var(--page);
}

/* ---------- LEGADO: classes das telas ainda não migradas ---------- */
.row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: var(--gap-section);
}

.tile {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 12px 16px;
}

.tile .label {
  font-size: 10px;
}

.tile .value {
  font-family: var(--font-mono);
  font-size: 21px;
  font-weight: 500;
  letter-spacing: -0.01em;
  margin-top: 3px;
}

.tile .sub {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 3px;
}

.card.warn {
  border-color: var(--warn);
  background: var(--tint-warn);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

th {
  text-align: left;
  color: var(--muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  font-weight: 400;
  border-bottom: 1px solid var(--divider);
  padding: 6px 8px;
}

td {
  padding: 7px 8px;
  border-bottom: 1px solid var(--divider);
}

td.num,
th.num {
  text-align: right;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.pos {
  color: var(--accent);
}

.badge {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  color: var(--ink-2);
  white-space: nowrap;
}

.bar-track {
  background: var(--track);
  border-radius: var(--r-pill);
  height: 6px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: var(--r-pill);
  background: var(--accent);
}

.bar-fill.over {
  background: var(--over);
}

.trends-wrap {
  overflow-x: auto;
}

.trends-wrap th,
.trends-wrap td {
  white-space: nowrap;
}

.trends-wrap th.sticky,
.trends-wrap td.sticky {
  position: sticky;
  left: 0;
  background: var(--surface);
  z-index: 1;
  text-align: left;
}

.trends-wrap th.cur,
.trends-wrap td.cur {
  background: var(--tint-accent);
}

.trends-wrap td.section {
  padding-top: 14px;
  font-weight: 700;
}
```

- [ ] **Step 3.6: Trocar os imports e apagar o CSS antigo**

Em `frontend/src/main.tsx`, substituir a linha 6:

```tsx
import "./styles.css";
```

por:

```tsx
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/pages.css";
```

Depois:

```bash
cd /home/mathe/programming/financial-tracking-platform
git rm frontend/src/styles.css
```

- [ ] **Step 3.7: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo limpo; o build gera CSS a partir dos quatro arquivos. O warning de chunk >500kB continua (recharts ainda instalado) — some no plano 01.

- [ ] **Step 3.8: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/index.html frontend/src/main.tsx frontend/src/styles frontend/src/styles.css
git commit -m "feat(ui): redesign design tokens, fonts and css layering"
```

---

### Task 4: Shell — sidebar sem emoji e tema em segmented control

**Files:**
- Create: `frontend/src/components/Segmented.tsx`
- Modify: `frontend/src/theme/ThemeContext.tsx:15-19,67-71`
- Modify: `frontend/src/theme/theme.ts:9-13`
- Modify: `frontend/src/theme/theme.test.ts:3,18-24`
- Modify: `frontend/src/components/Layout.tsx` (arquivo inteiro)

O rodapé da sidebar vira um segmented control, então o contexto de tema precisa expor
`setMode` em vez do `cycle` de três estados. `nextMode` fica sem uso e sai junto com o
seu bloco de teste.

- [ ] **Step 4.1: Criar o `Segmented`**

Create `frontend/src/components/Segmented.tsx`:

```tsx
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export default function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "seg-item is-active" : "seg-item"}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4.2: `ThemeContext` expõe `setMode`**

Em `frontend/src/theme/ThemeContext.tsx`:

1. No import de `./theme` (linha 11), tirar `nextMode`:

```tsx
import { parseMode, resolveTheme, type ResolvedTheme, type ThemeMode } from "./theme";
```

2. Na interface (linhas 15-19), trocar `cycle` por `setMode`:

```tsx
interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}
```

3. Apagar a linha `const cycle = useCallback(setMode => …)` — no arquivo atual é
   `const cycle = useCallback(() => setMode(nextMode), []);` — e substituir a linha
   seguinte, `const value = useMemo(() => ({ mode, resolved, cycle }), [mode, resolved, cycle]);`,
   por:

```tsx
  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved]);
```

4. No import do React (linhas 1-9), remover `useCallback` da lista — era o seu único uso;
   `setMode` vem do `useState` e já é estável.

- [ ] **Step 4.3: Remover `nextMode` e o seu teste**

Em `frontend/src/theme/theme.ts`, apagar a função `nextMode` (linhas 9-13).

Em `frontend/src/theme/theme.test.ts`, ajustar o import da linha 3 para
`import { parseMode, resolveTheme } from "./theme";` e apagar o bloco
`describe("nextMode", …)` inteiro (linhas 18-24).

- [ ] **Step 4.4: Reescrever o `Layout`**

Substituir todo o conteúdo de `frontend/src/components/Layout.tsx` por:

```tsx
import { NavLink, Outlet, useLocation } from "react-router-dom";

import type { ThemeMode } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import Segmented from "./Segmented";

const LINKS = [
  ["/", "Dashboard"],
  ["/transacoes", "Transações"],
  ["/orcamento", "Orçamento"],
  ["/tendencias", "Tendências"],
  ["/importar", "Importar"],
  ["/config", "Configurações"],
] as const;

// O handoff desenha dois estados (escuro | claro); o app tem três modos e o
// automático é o padrão — mantido como primeiro item do mesmo controle.
const THEME_OPTIONS: readonly { value: ThemeMode; label: string }[] = [
  { value: "system", label: "auto" },
  { value: "light", label: "claro" },
  { value: "dark", label: "escuro" },
];

export default function Layout() {
  const { mode, setMode } = useTheme();
  const { pathname } = useLocation();
  const wide = pathname === "/tendencias"; // matriz de meses precisa da tela toda
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-name">Finanças</div>
        </div>
        <nav className="nav">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              <span className="nav-dot" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>Tema</span>
          <Segmented
            value={mode}
            options={THEME_OPTIONS}
            onChange={setMode}
            ariaLabel="Tema"
          />
        </div>
      </aside>
      <main className={wide ? "main main--wide" : "main"}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 4.5: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: tsc limpo; `40 passed` (41 − o teste de `nextMode`); lint limpo.

- [ ] **Step 4.6: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/Segmented.tsx frontend/src/components/Layout.tsx frontend/src/theme
git commit -m "feat(ui): redesigned shell with dotted nav and theme segmented control"
```

---

### Task 5: Primitivos compartilhados

**Files:**
- Create: `frontend/src/lib/pct.ts`
- Test: `frontend/src/lib/pct.test.ts`
- Create: `frontend/src/lib/tone.ts`
- Modify: `frontend/src/lib/money.ts`
- Modify: `frontend/src/lib/money.test.ts`
- Create: `frontend/src/components/Money.tsx`
- Create: `frontend/src/components/PageHeader.tsx`
- Create: `frontend/src/components/Chip.tsx`
- Create: `frontend/src/components/Pill.tsx`
- Create: `frontend/src/components/ProgressBar.tsx`
- Modify: `frontend/src/components/MonthPicker.tsx` (arquivo inteiro)

- [ ] **Step 5.1: Escrever os testes de `pct` e do formato com sinal**

Create `frontend/src/lib/pct.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { clampPct, pctOf } from "./pct";

describe("clampPct", () => {
  it("mantém o valor dentro de 0–100", () => {
    expect(clampPct(63)).toBe(63);
    expect(clampPct(-10)).toBe(0);
    expect(clampPct(180)).toBe(100);
  });
  it("trata não-número como zero", () => {
    expect(clampPct(NaN)).toBe(0);
    expect(clampPct(Infinity)).toBe(100);
  });
});

describe("pctOf", () => {
  it("calcula a fração em percentual", () => {
    expect(pctOf(93870, 150000)).toBeCloseTo(62.58, 2);
  });
  it("denominador zero ou negativo vira zero", () => {
    expect(pctOf(1000, 0)).toBe(0);
    expect(pctOf(1000, -500)).toBe(0);
  });
  it("estouro satura em 100", () => {
    expect(pctOf(200000, 150000)).toBe(100);
  });
});
```

Em `frontend/src/lib/money.test.ts`, ajustar o import da linha 3 para incluir a função
nova e acrescentar o bloco ao final do arquivo:

```ts
import { formatBRL, formatSigned, parseBRL } from "./money";
```

```ts
describe("formatSigned", () => {
  it("usa o traço tipográfico no negativo", () => {
    expect(clean(formatSigned(-459928))).toBe("−R$ 4.599,28");
  });
  it("com alwaysSign, positivo ganha +", () => {
    expect(clean(formatSigned(5048, true))).toBe("+R$ 50,48");
    expect(clean(formatSigned(5048))).toBe("R$ 50,48");
  });
  it("zero nunca ganha sinal", () => {
    expect(clean(formatSigned(0, true))).toBe("R$ 0,00");
  });
});
```

- [ ] **Step 5.2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/pct.test.ts src/lib/money.test.ts`
Expected: FAIL — `Cannot find module './pct'` e `formatSigned is not a function`.

- [ ] **Step 5.3: Implementar `pct.ts` e `formatSigned`**

Create `frontend/src/lib/pct.ts`:

```ts
/** Percentual de barra: nunca sai de 0–100, nunca vira NaN. */
export function clampPct(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** Fração parte/total em percentual; total ausente ou não-positivo vira 0. */
export function pctOf(part: number, total: number): number {
  return total > 0 ? clampPct((part / total) * 100) : 0;
}
```

Em `frontend/src/lib/money.ts`, acrescentar ao final:

```ts
// U+2212: o traço de menos do design, não o hífen que o toLocaleString usa.
const MINUS = "−";

/**
 * Valor com sinal explícito. Negativo sempre ganha "−"; positivo só ganha "+"
 * quando o sinal é a informação (investimento: aporte vs. resgate).
 */
export function formatSigned(cents: number, alwaysSign = false): string {
  const abs = formatBRL(Math.abs(cents));
  if (cents < 0) return MINUS + abs;
  return alwaysSign && cents > 0 ? `+${abs}` : abs;
}
```

- [ ] **Step 5.4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/lib/pct.test.ts src/lib/money.test.ts`
Expected: PASS.

- [ ] **Step 5.5: Criar os componentes**

Create `frontend/src/lib/tone.ts` (os quatro primitivos abaixo compartilham este tipo;
cada nome corresponde a uma classe `.tone-*` de `components.css`):

```ts
export type Tone = "accent" | "warn" | "over" | "invest" | "ink" | "ink-2" | "muted";
```

Create `frontend/src/components/Money.tsx`:

```tsx
import { formatSigned } from "../lib/money";
import type { Tone } from "../lib/tone";

/**
 * Valor monetário em mono. Três ausências distintas, conforme o design:
 * zero vira "—", dado inexistente vira "n/d" itálico, e o resto é valor.
 */
export default function Money({
  cents,
  tone,
  alwaysSign = false,
  zeroDash = false,
  nd = false,
  className,
}: {
  cents: number;
  tone?: Tone;
  alwaysSign?: boolean;
  zeroDash?: boolean;
  nd?: boolean;
  className?: string;
}) {
  const classes = ["money"];
  if (className) classes.push(className);
  if (nd) return <span className={[...classes, "is-nd"].join(" ")}>n/d</span>;
  if (zeroDash && cents === 0)
    return <span className={[...classes, "is-zero"].join(" ")}>—</span>;
  if (tone) classes.push(`tone-${tone}`);
  return <span className={classes.join(" ")}>{formatSigned(cents, alwaysSign)}</span>;
}
```

Create `frontend/src/components/PageHeader.tsx`:

```tsx
import type { ReactNode } from "react";

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {children && <div className="page-header-aside">{children}</div>}
    </header>
  );
}
```

Create `frontend/src/components/Chip.tsx`:

```tsx
import type { ReactNode } from "react";

import type { Tone } from "../lib/tone";

/**
 * Chip clicável (filtro, categoria). Sem `onClick` vira um rótulo estático —
 * a borda só aparece no hover quando há ação.
 */
export default function Chip({
  children,
  tone,
  active = false,
  onClick,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const classes = ["chip"];
  if (active) classes.push("is-active");
  if (tone) classes.push(`tone-${tone}`);
  const className = classes.join(" ");
  if (!onClick) return <span className={className} title={title}>{children}</span>;
  return (
    <button type="button" className={className} onClick={onClick} title={title}>
      {children}
    </button>
  );
}
```

Create `frontend/src/components/Pill.tsx`:

```tsx
import type { ReactNode } from "react";

import type { Tone } from "../lib/tone";

/** Rótulo de estado (aporte, resgate, previsto). Tracejado = previsto, não realizado. */
export default function Pill({
  children,
  tone,
  dashed = false,
}: {
  children: ReactNode;
  tone?: Tone;
  dashed?: boolean;
}) {
  const classes = ["pill"];
  if (dashed) classes.push("dashed");
  if (tone) classes.push(`tone-${tone}`);
  return <span className={classes.join(" ")}>{children}</span>;
}
```

Create `frontend/src/components/ProgressBar.tsx`:

```tsx
import { clampPct } from "../lib/pct";
import type { Tone } from "../lib/tone";

/**
 * Barra de progresso. `pace` desenha a marca de ritmo do mês: estar à esquerda
 * dela é estar dentro do ritmo — leitura que o "% do orçado consumido" não dá.
 */
export default function ProgressBar({
  pct,
  pace,
  tone = "accent",
  height = 5,
  dashed = false,
  ariaLabel,
}: {
  pct: number;
  pace?: number;
  tone?: Tone;
  height?: number;
  dashed?: boolean;
  ariaLabel?: string;
}) {
  const value = clampPct(pct);
  return (
    <div
      className={`bar tone-${tone}`}
      style={{ height }}
      role="img"
      aria-label={ariaLabel ?? `${Math.round(value)}%`}
    >
      <div
        className={dashed ? "bar-value dashed" : "bar-value"}
        style={{ width: `${value}%` }}
      />
      {pace !== undefined && (
        <span className="bar-pace" style={{ left: `${clampPct(pace)}%` }} />
      )}
    </div>
  );
}
```

Substituir todo o conteúdo de `frontend/src/components/MonthPicker.tsx` por:

```tsx
import { addMonths, monthLabel } from "../lib/months";

export default function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  return (
    <div className="month-picker">
      <button aria-label="Mês anterior" onClick={() => onChange(addMonths(month, -1))}>
        ‹
      </button>
      <span className="month-label">{monthLabel(month)}</span>
      <button aria-label="Próximo mês" onClick={() => onChange(addMonths(month, 1))}>
        ›
      </button>
    </div>
  );
}
```

- [ ] **Step 5.6: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: tsc limpo; **48 passed** (40 vindos da Task 4 + 5 novos em `pct.test.ts` + 3
novos em `money.test.ts`); lint limpo; build ok.

- [ ] **Step 5.7: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/lib/pct.ts frontend/src/lib/pct.test.ts frontend/src/lib/tone.ts frontend/src/lib/money.ts frontend/src/lib/money.test.ts frontend/src/components
git commit -m "feat(ui): shared design primitives for the redesign"
```

---

### Task 6: Verificação final

- [ ] **Step 6.1: Suítes completas**

Run: `cd frontend && npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: 48 testes PASS, tsc/lint limpos, build ok.

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: `110 passed`.

- [ ] **Step 6.2: Verificação visual (skill webapp-testing)**

Subir backend (8000) e vite (5173). O uvicorn **precisa reiniciar** — `budget.py` mudou.
Conferir em `http://localhost:5173/`:

1. **Sidebar:** 212px, marca teal quadrada, 6 itens sem emoji com ponto à esquerda; o
   item ativo com fundo teal translúcido e ponto teal; rodapé "Tema" com segmented
   `auto | claro | escuro`.
2. **Tema:** clicar nos três itens do segmented; confirmar que o item ativo destaca e que
   a página inteira troca de paleta. Recarregar e confirmar que o modo persiste.
3. **Tipografia:** os valores em `.tile .value` saem em IBM Plex Mono (comparar com o
   texto em Plex Sans ao lado). Se a fonte não carregar, o console mostra falha no
   request do Google Fonts.
4. **KPI de ritmo** no Dashboard: valor em `pts` e legenda "gastou X% do orçado com Y% do
   mês corrido".
5. **Seletor de mês:** `‹ ago/26 ›` com o rótulo em mono entre bordas; navegar um mês
   para trás e para frente.
6. **Telas não migradas** (`/transacoes`, `/orcamento`, `/tendencias`, `/importar`,
   `/config`): abrir as cinco e confirmar que ainda renderizam e são utilizáveis — vão
   estar visualmente inconsistentes (títulos menores, tabelas com a paleta nova), o que é
   esperado até os planos 01–06.
7. Screenshot de `/` em dark e em light.

- [ ] **Step 6.3: Revisão de código**

Usar a skill superpowers:requesting-code-review sobre o conjunto de commits deste plano
(preferência do usuário: sem revisor por task, uma revisão ao final).
