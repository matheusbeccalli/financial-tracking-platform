# Redesign — Plano 06: Configurações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a tela de Configurações conforme o protótipo `Configuracoes.dc.html` do bundle de handoff (local, não versionado) — card do LLM com cards de modelo e pill da chave, categorias agrupadas por kind com edição inline (nome, cor, tipo, arquivar), rail sticky de contas agrupado por instituição, e regras de classificação com busca e chip de categoria — encerrando o redesign das 6 telas.

**Architecture:** Sem backend novo. Toda a lógica pura (agrupamento por kind, agrupamento por instituição, sumário pluralizado, busca de regras) vai para `lib/settings.ts` com vitest. O `InlineText` (hoje privado da página, com estilo inline) é promovido a componente compartilhado com classe CSS. O chip de categoria das regras reusa o `CategoryChip` do redesign de Transações; `CategorySelect.tsx` (só a página antiga usava) morre. A página se divide em `components/settings/{LlmCard,CategoriesCard,AccountsRail,RulesCard}.tsx`. Como esta é a última tela, a task final remove o CSS legado de `pages.css` que ficar sem uso.

**Tech Stack:** React 19 + TypeScript, TanStack Query, vitest, CSS puro com os tokens e primitivos dos planos 00–05.

**Spec:** `docs/superpowers/specs/2026-08-09-frontend-redesign-design.md`

**Baseline antes de começar:** frontend 132 testes, backend 110 testes, ambos verdes, em `874eb59`.

### Decisões tomadas para este plano

1. **"Regras de ignorar" fica.** O protótipo não a desenha, mas é funcionalidade real (o ⊘ de Transações cria essas regras). Vira um bloco próprio dentro do card de Regras, na mesma linguagem visual (matcher mono + tag "ignorada" + ×).
2. **Chip de categoria das regras = `CategoryChip`** (botão com `<select>` invisível, tone invest automático). `CategorySelect.tsx` é apagado — só a página antiga usava.
3. **Categorias agrupadas por kind, alfabéticas** (pt-BR, sem sensibilidade a acento). Arquivadas só aparecem com o checkbox ligado, com opacidade e ação "restaurar", dentro do próprio grupo.
4. **`InlineText` compartilhado** em `components/InlineText.tsx`, com classe `.inline-text` (regra da spec: zero estilo inline). Ganha sincronização com o valor externo e reset quando o texto fica vazio.
5. **Busca das regras é client-side**, casa matcher **ou** nome da categoria, case-insensitive simples (matchers são normalizados sem acento; para nomes de categoria, minúsculas bastam).
6. **Cards de modelo**: os 2 conhecidos (Haiku padrão, Sonnet) + "Outro modelo" com input (Enter seleciona). "Salvar modelo" desabilitado sem mudança, com hint ao lado. Pill da chave: accent quando configurada, over com instrução quando não.
7. **Última tela ⇒ limpeza do legado**: a task 4 remove de `pages.css` os aliases (`--good`/`--critical`/`--baseline`) e classes legadas que ficarem sem nenhum uso (verificado por grep), mantendo o que Transações ainda usa (ex.: estilos de `table`).
8. **Largura da página limitada a 1240px**, como o `main` do protótipo.

---

### Task 1: Módulo puro `lib/settings.ts` (TDD) + `InlineText` compartilhado

**Files:**
- Create: `frontend/src/lib/settings.ts`
- Test: `frontend/src/lib/settings.test.ts`
- Create: `frontend/src/components/InlineText.tsx`
- Modify: `frontend/src/styles/pages.css`

- [ ] **Step 1.1: Escrever os testes**

Create `frontend/src/lib/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Account, Category, CategoryKind, Rule } from "../api/types";
import { accountsSummary, filterRules, groupAccounts, groupByKind } from "./settings";

const cat = (id: number, name: string, kind: CategoryKind = "saida", archived = false): Category => ({
  id,
  name,
  kind,
  color: "#888",
  archived,
});

const acc = (id: number, name: string, institution: string): Account => ({
  id,
  name,
  institution,
  kind: "corrente",
});

const rule = (id: number, matcher: string, category_id: number): Rule => ({
  id,
  matcher,
  category_id,
});

describe("groupByKind", () => {
  const CATS = [
    cat(1, "Mercado"),
    cat(2, "Aula Padel"),
    cat(3, "Velha", "saida", true),
    cat(4, "Salário", "entrada"),
    cat(5, "Investimentos", "investimento"),
  ];

  it("agrupa por kind e esconde arquivadas por padrão", () => {
    const g = groupByKind(CATS, false);
    expect(g.saida.map((c) => c.name)).toEqual(["Aula Padel", "Mercado"]);
    expect(g.entrada.map((c) => c.name)).toEqual(["Salário"]);
    expect(g.investimento.map((c) => c.name)).toEqual(["Investimentos"]);
  });

  it("mostra arquivadas no grupo quando pedido, em ordem alfabética", () => {
    const g = groupByKind(CATS, true);
    expect(g.saida.map((c) => c.name)).toEqual(["Aula Padel", "Mercado", "Velha"]);
  });

  it("ordena sem sensibilidade a acento", () => {
    const g = groupByKind([cat(1, "Água"), cat(2, "Assinaturas")], false);
    expect(g.saida.map((c) => c.name)).toEqual(["Água", "Assinaturas"]);
  });
});

describe("groupAccounts", () => {
  it("agrupa por instituição, instituições e contas em ordem alfabética", () => {
    const g = groupAccounts([
      acc(1, "Inter Conta", "inter"),
      acc(2, "Bradesco Cartão", "bradesco"),
      acc(3, "Bradesco Conta", "bradesco"),
    ]);
    expect(g.map((x) => x.institution)).toEqual(["bradesco", "inter"]);
    expect(g[0].accounts.map((a) => a.name)).toEqual(["Bradesco Cartão", "Bradesco Conta"]);
  });

  it("lista vazia devolve vazio", () => {
    expect(groupAccounts([])).toEqual([]);
  });
});

describe("accountsSummary", () => {
  it("pluraliza contas e instituições", () => {
    expect(
      accountsSummary([
        acc(1, "A", "bradesco"),
        acc(2, "B", "bradesco"),
        acc(3, "C", "inter"),
        acc(4, "D", "inter"),
      ])
    ).toBe("4 contas em 2 instituições");
  });

  it("singular quando é uma só", () => {
    expect(accountsSummary([acc(1, "A", "bradesco")])).toBe("1 conta em 1 instituição");
  });
});

describe("filterRules", () => {
  const CATS = [cat(10, "Impostos & Taxas"), cat(11, "Moradia & Utilidades")];
  const RULES = [
    rule(1, "IOF S UTILIZACAO LIMITE", 10),
    rule(2, "CONTA LUZ ENEL DISTRIB SP", 11),
    rule(3, "CONTA TELEFONE VIVO", 11),
  ];

  it("busca vazia devolve tudo", () => {
    expect(filterRules(RULES, CATS, "")).toEqual(RULES);
    expect(filterRules(RULES, CATS, "   ")).toEqual(RULES);
  });

  it("casa o matcher, case-insensitive", () => {
    expect(filterRules(RULES, CATS, "iof").map((r) => r.id)).toEqual([1]);
  });

  it("casa o nome da categoria", () => {
    expect(filterRules(RULES, CATS, "moradia").map((r) => r.id)).toEqual([2, 3]);
  });

  it("sem resultado devolve vazio", () => {
    expect(filterRules(RULES, CATS, "xyz")).toEqual([]);
  });
});
```

- [ ] **Step 1.2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/settings.test.ts`
Expected: FAIL — `Cannot find module './settings'`.

- [ ] **Step 1.3: Implementar**

Create `frontend/src/lib/settings.ts`:

```ts
import type { Account, Category, CategoryKind, Rule } from "../api/types";

const porNome = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });

/** Categorias agrupadas por kind, alfabéticas. Arquivadas só entram com a flag. */
export function groupByKind(
  categories: Category[],
  showArchived: boolean
): Record<CategoryKind, Category[]> {
  const groups: Record<CategoryKind, Category[]> = {
    entrada: [],
    saida: [],
    investimento: [],
  };
  for (const c of categories) {
    if (!showArchived && c.archived) continue;
    groups[c.kind].push(c);
  }
  for (const kind of Object.keys(groups) as CategoryKind[]) groups[kind].sort(porNome);
  return groups;
}

export interface AccountGroup {
  institution: string;
  accounts: Account[];
}

export function groupAccounts(accounts: Account[]): AccountGroup[] {
  const map = new Map<string, Account[]>();
  for (const a of accounts) {
    const list = map.get(a.institution) ?? [];
    list.push(a);
    map.set(a.institution, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([institution, list]) => ({ institution, accounts: [...list].sort(porNome) }));
}

/** "4 contas em 2 instituições", com singular quando for o caso. */
export function accountsSummary(accounts: Account[]): string {
  const n = accounts.length;
  const i = new Set(accounts.map((a) => a.institution)).size;
  return `${n} ${n === 1 ? "conta" : "contas"} em ${i} ${i === 1 ? "instituição" : "instituições"}`;
}

/** Busca client-side: casa o matcher ou o nome da categoria, sem case. */
export function filterRules(rules: Rule[], categories: Category[], q: string): Rule[] {
  const query = q.trim().toLowerCase();
  if (!query) return rules;
  const nome = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
  return rules.filter(
    (r) =>
      r.matcher.toLowerCase().includes(query) ||
      (nome.get(r.category_id) ?? "").includes(query)
  );
}
```

- [ ] **Step 1.4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/lib/settings.test.ts && npx tsc --noEmit`
Expected: 11 testes PASS; tsc limpo.

- [ ] **Step 1.5: `InlineText` compartilhado**

Create `frontend/src/components/InlineText.tsx`:

```tsx
import { useEffect, useState } from "react";

/**
 * Texto editável inline: parece texto parado, mas é um input — hover revela,
 * foco abre a edição, blur/Enter gravam. Vazio volta ao valor original.
 */
export default function InlineText({
  value,
  onSave,
  ariaLabel,
}: {
  value: string;
  onSave: (v: string) => void;
  ariaLabel: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className="inline-text"
      value={text}
      aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = text.trim();
        if (t && t !== value) onSave(t);
        else setText(value);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
```

- [ ] **Step 1.6: CSS do `InlineText`**

Ao final de `frontend/src/styles/pages.css`:

```css
/* ---------- Configurações ---------- */
.inline-text {
  font: inherit;
  font-size: 12.5px;
  color: var(--ink);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 4px;
  margin-left: -4px;
  min-width: 0;
  width: 100%;
}

.inline-text:hover {
  background: var(--hover-ghost);
}

.inline-text:focus {
  outline: none;
  border-color: var(--focus);
  background: var(--surface-2);
}
```

- [ ] **Step 1.7: Verificar e commitar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: 143 testes (132 + 11), tudo verde.

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/lib/settings.ts frontend/src/lib/settings.test.ts frontend/src/components/InlineText.tsx frontend/src/styles/pages.css
git commit -m "feat(ui): settings grouping module and shared inline text input"
```

---

### Task 2: `LlmCard` + `CategoriesCard`

**Files:**
- Create: `frontend/src/components/settings/LlmCard.tsx`
- Create: `frontend/src/components/settings/CategoriesCard.tsx`
- Modify: `frontend/src/styles/pages.css`

- [ ] **Step 2.1: `LlmCard`**

Create `frontend/src/components/settings/LlmCard.tsx`:

```tsx
import { useState } from "react";

import { usePutSettings, useSettings } from "../../api/hooks";

const KNOWN_MODELS = [
  { id: "claude-haiku-4-5-20251001", nome: "Claude Haiku 4.5", sub: "padrão · custo mínimo" },
  { id: "claude-sonnet-5", nome: "Claude Sonnet 5", sub: "mais qualidade" },
];

export default function LlmCard() {
  const { data: settings } = useSettings();
  const putSettings = usePutSettings();
  const [model, setModel] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  if (!settings) return null;

  const value = model ?? settings.llm_model;
  const dirty = value !== settings.llm_model;
  const isKnown = KNOWN_MODELS.some((m) => m.id === value);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Classificação por LLM</h2>
        <span className={settings.api_key_set ? "set-key-pill" : "set-key-pill is-missing"}>
          <span className="set-key-dot" />
          {settings.api_key_set
            ? "Chave da API configurada"
            : "sem chave — defina ANTHROPIC_API_KEY em backend/.env e reinicie"}
        </span>
      </div>

      <div className="set-models">
        {KNOWN_MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={value === m.id ? "set-model is-active" : "set-model"}
            onClick={() => setModel(m.id)}
          >
            <span className="set-model-name">
              <span className="set-radio" aria-hidden="true" />
              {m.nome}
            </span>
            <span className="set-model-sub">{m.sub}</span>
            <span className="set-model-id mono">{m.id}</span>
          </button>
        ))}
        <div className={isKnown ? "set-model set-model--other" : "set-model set-model--other is-active"}>
          <span className="set-model-name">Outro modelo</span>
          {!isKnown && <span className="set-model-id mono">{value}</span>}
          <input
            className="mono"
            placeholder="id do modelo + Enter"
            value={custom}
            aria-label="Id de modelo custom"
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.trim()) {
                setModel(custom.trim());
                setCustom("");
              }
            }}
          />
        </div>
      </div>

      <div className="set-save">
        <button
          type="button"
          className="primary"
          disabled={!dirty || putSettings.isPending}
          onClick={() => putSettings.mutate({ llm_model: value })}
        >
          Salvar modelo
        </button>
        <span className="note">
          {dirty
            ? "modelo alterado — salve para valer nas próximas classificações"
            : "nenhuma mudança para salvar"}
        </span>
      </div>
    </section>
  );
}
```

- [ ] **Step 2.2: `CategoriesCard`**

Create `frontend/src/components/settings/CategoriesCard.tsx`:

```tsx
import { useState } from "react";

import { useCategories, useCreateCategory, usePatchCategory } from "../../api/hooks";
import type { Category, CategoryKind } from "../../api/types";
import { groupByKind } from "../../lib/settings";
import InlineText from "../InlineText";
import Segmented from "../Segmented";

const KIND_OPTIONS = [
  { value: "saida" as const, label: "saída" },
  { value: "entrada" as const, label: "entrada" },
  { value: "investimento" as const, label: "investimento" },
];

const SECTIONS: { kind: CategoryKind; label: string; nota?: string }[] = [
  { kind: "entrada", label: "Entradas" },
  {
    kind: "investimento",
    label: "Investimento",
    nota: "— não entra em entradas nem em saídas",
  },
  { kind: "saida", label: "Saídas" },
];

type CatPatch = { name?: string; color?: string; archived?: boolean; kind?: CategoryKind };

export default function CategoriesCard() {
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const patchCategory = usePatchCategory();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("saida");
  const [showArchived, setShowArchived] = useState(false);

  const all = categories ?? [];
  const ativas = all.filter((c) => !c.archived).length;
  const groups = groupByKind(all, showArchived);
  const patch = (id: number, p: CatPatch) => patchCategory.mutate({ id, patch: p });

  const add = () => {
    if (!name.trim()) return;
    createCategory.mutate({ name: name.trim(), kind });
    setName("");
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Categorias</h2>
          <div className="sub">
            {ativas} ativas · clique no nome para renomear, no quadrado para a cor, na
            etiqueta para o tipo
          </div>
        </div>
        <label className="set-archived-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          mostrar arquivadas
        </label>
      </div>

      <div className="set-new-cat">
        <input
          placeholder="Nova categoria…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Segmented
          value={kind}
          options={KIND_OPTIONS}
          onChange={setKind}
          ariaLabel="Tipo da nova categoria"
        />
        <button type="button" disabled={!name.trim()} onClick={add}>
          Adicionar
        </button>
      </div>
      {createCategory.error && (
        <p className="error">{(createCategory.error as Error).message}</p>
      )}

      {SECTIONS.map(({ kind: k, label, nota }) => (
        <div key={k}>
          <div className="set-cat-section">
            <span className={`set-dot set-dot--${k}`} />
            <span className="set-cat-section-label">{label}</span>
            {nota && <span className="set-cat-section-nota">{nota}</span>}
          </div>
          <div className="set-cat-grid">
            {groups[k].map((c) => (
              <CategoryRow key={c.id} c={c} onPatch={patch} />
            ))}
            {groups[k].length === 0 && <p className="muted">Nenhuma categoria.</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryRow({
  c,
  onPatch,
}: {
  c: Category;
  onPatch: (id: number, p: CatPatch) => void;
}) {
  return (
    <div className={c.archived ? "set-cat-row is-archived" : "set-cat-row"}>
      {/* O quadrado é um label sobre um input[type=color] escondido: clique abre o picker. */}
      <label className="set-swatch" style={{ background: c.color }}>
        <input
          type="color"
          value={c.color}
          aria-label={`Cor da categoria ${c.name}`}
          onChange={(e) => onPatch(c.id, { color: e.target.value })}
        />
      </label>
      <InlineText
        value={c.name}
        ariaLabel={`Nome da categoria ${c.name}`}
        onSave={(novo) => onPatch(c.id, { name: novo })}
      />
      <KindPill c={c} onPatch={onPatch} />
      <button
        type="button"
        className="set-archive"
        onClick={() => onPatch(c.id, { archived: !c.archived })}
      >
        {c.archived ? "restaurar" : "arquivar"}
      </button>
    </div>
  );
}

function KindPill({
  c,
  onPatch,
}: {
  c: Category;
  onPatch: (id: number, p: CatPatch) => void;
}) {
  return (
    <span className={c.kind === "investimento" ? "set-kind-pill tone-invest" : "set-kind-pill"}>
      <span>{c.kind === "saida" ? "saída" : c.kind} ⌄</span>
      <select
        className="set-kind-select"
        aria-label={`Tipo da categoria ${c.name}`}
        value={c.kind}
        onChange={(e) => {
          const kind = e.target.value as CategoryKind;
          if (kind === c.kind) return;
          if (
            window.confirm(
              `Mudar "${c.name}" de "${c.kind}" para "${kind}"? Os dashboards de todos os meses, inclusive passados, passam a interpretar a categoria pelo novo tipo.`
            )
          )
            onPatch(c.id, { kind });
        }}
      >
        <option value="saida">saída</option>
        <option value="entrada">entrada</option>
        <option value="investimento">investimento</option>
      </select>
    </span>
  );
}
```

- [ ] **Step 2.3: CSS**

Ao final da seção "Configurações" de `frontend/src/styles/pages.css`:

```css
.set-key-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: var(--ink-2);
  padding: 3px 10px;
  border-radius: var(--r-pill);
  background: var(--tint-accent);
  border: 1px solid var(--focus);
}

.set-key-dot {
  width: 5px;
  height: 5px;
  border-radius: var(--r-pill);
  background: var(--accent);
  flex: none;
}

.set-key-pill.is-missing {
  background: var(--tint-over);
  border-color: var(--over);
  color: var(--over);
}

.set-key-pill.is-missing .set-key-dot {
  background: var(--over);
}

.set-models {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.set-model {
  font: inherit;
  text-align: left;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  padding: 12px 13px;
  cursor: pointer;
  background: var(--surface-2);
  color: var(--ink);
}

.set-model.is-active {
  border-color: var(--focus);
  background: var(--tint-accent);
}

.set-model--other {
  border-style: dashed;
  cursor: default;
}

.set-model-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}

.set-radio {
  width: 11px;
  height: 11px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border-strong);
  flex: none;
}

.set-model.is-active .set-radio {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: inset 0 0 0 2.5px var(--surface);
}

.set-model-sub {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 5px;
}

.set-model-id {
  font-size: 10.5px;
  color: var(--muted);
  margin-top: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.set-model--other input {
  width: 100%;
  box-sizing: border-box;
  margin-top: 8px;
  font-size: 11.5px;
}

.set-save {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 13px;
}

.set-archived-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--ink-2);
  cursor: pointer;
  white-space: nowrap;
}

.set-archived-toggle input {
  accent-color: var(--accent);
}

.set-new-cat {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 13px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}

.set-new-cat > input {
  flex: 1;
  min-width: 130px;
}

.set-cat-section {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  margin-bottom: 4px;
}

.set-dot {
  width: 6px;
  height: 6px;
  border-radius: 2px;
}

.set-dot--entrada {
  background: var(--accent);
}

.set-dot--investimento {
  background: var(--invest);
}

.set-dot--saida {
  background: var(--muted);
}

.set-cat-section-label {
  font-size: 10px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--muted);
}

.set-cat-section-nota {
  font-size: 11px;
  color: var(--muted);
}

.set-cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0 24px;
}

.set-cat-row {
  display: grid;
  grid-template-columns: 16px minmax(92px, 1fr) auto auto;
  align-items: center;
  gap: 9px;
  padding: 5px 0;
  border-bottom: 1px solid var(--divider);
}

.set-cat-row.is-archived {
  opacity: 0.5;
}

.set-swatch {
  position: relative;
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid var(--border-strong);
  cursor: pointer;
}

.set-swatch input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  padding: 0;
  border: 0;
}

.set-kind-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  font-size: 10.5px;
  color: var(--ink-2);
  padding: 1.5px 7px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border-strong);
  white-space: nowrap;
  cursor: pointer;
}

.set-kind-pill:hover {
  border-color: var(--focus);
  color: var(--accent);
}

.set-kind-pill.tone-invest {
  border-color: var(--invest-border);
}

.set-kind-pill.tone-invest:hover {
  border-color: var(--invest);
  color: var(--invest);
}

.set-kind-select {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  border: 0;
  padding: 0;
}

.set-archive {
  font: inherit;
  font-size: 11px;
  color: var(--muted);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  white-space: nowrap;
}

.set-archive:hover {
  color: var(--over);
}
```

- [ ] **Step 2.4: Verificar e commitar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: tudo verde (143 testes; componentes ainda não usados).

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/settings frontend/src/styles/pages.css
git commit -m "feat(ui): settings llm and categories cards"
```

---

### Task 3: `AccountsRail` + `RulesCard`

**Files:**
- Create: `frontend/src/components/settings/AccountsRail.tsx`
- Create: `frontend/src/components/settings/RulesCard.tsx`
- Modify: `frontend/src/styles/pages.css`

- [ ] **Step 3.1: `AccountsRail`**

Create `frontend/src/components/settings/AccountsRail.tsx`:

```tsx
import { useState } from "react";

import { useAccounts, useCreateAccount, usePatchAccount } from "../../api/hooks";
import { accountsSummary, groupAccounts } from "../../lib/settings";
import InlineText from "../InlineText";
import Segmented from "../Segmented";

const ACC_KINDS = [
  { value: "corrente" as const, label: "corrente" },
  { value: "cartao" as const, label: "cartão" },
];

export default function AccountsRail() {
  const { data: accounts } = useAccounts();
  const createAccount = useCreateAccount();
  const patchAccount = usePatchAccount();
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [kind, setKind] = useState<"corrente" | "cartao">("corrente");

  const list = accounts ?? [];
  const grupos = groupAccounts(list);

  const add = () => {
    if (!name.trim() || !institution.trim()) return;
    createAccount.mutate({
      name: name.trim(),
      institution: institution.trim().toLowerCase(),
      kind,
    });
    setName("");
    setInstitution("");
  };

  return (
    <div className="card set-accounts">
      <h2>Contas</h2>
      <div className="sub">{accountsSummary(list)}</div>

      <div className="set-inst-list">
        {grupos.map((g) => (
          <div key={g.institution}>
            <div className="label set-inst-label">{g.institution}</div>
            {g.accounts.map((a) => (
              <div key={a.id} className="set-account-row">
                <InlineText
                  value={a.name}
                  ariaLabel={`Nome da conta ${a.name}`}
                  onSave={(novo) => patchAccount.mutate({ id: a.id, name: novo })}
                />
                <span className="set-kind-tag">{a.kind === "cartao" ? "cartão" : a.kind}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="set-new-account">
        <div className="label">Nova conta</div>
        <input placeholder="Nome…" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          placeholder="Instituição…"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
        />
        <div className="set-new-account-row">
          <Segmented value={kind} options={ACC_KINDS} onChange={setKind} ariaLabel="Tipo da conta" />
          <button type="button" disabled={!name.trim() || !institution.trim()} onClick={add}>
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.2: `RulesCard`**

Create `frontend/src/components/settings/RulesCard.tsx`:

```tsx
import { useState } from "react";

import {
  useCategories,
  useDeleteIgnoreRule,
  useDeleteRule,
  usePatchRule,
  useRules,
  useIgnoreRules,
} from "../../api/hooks";
import { filterRules } from "../../lib/settings";
import CategoryChip from "../CategoryChip";

export default function RulesCard() {
  const { data: rules } = useRules();
  const { data: ignoreRules } = useIgnoreRules();
  const { data: categories } = useCategories();
  const patchRule = usePatchRule();
  const deleteRule = useDeleteRule();
  const deleteIgnoreRule = useDeleteIgnoreRule();
  const [q, setQ] = useState("");

  const total = (rules ?? []).length;
  const list = filterRules(rules ?? [], categories ?? [], q);
  const ignoradas = ignoreRules ?? [];

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Regras de classificação</h2>
          <div className="sub">
            {total} {total === 1 ? "regra" : "regras"} · cada correção de categoria em
            Transações cria uma nova
          </div>
        </div>
        <input
          className="set-rule-search"
          placeholder="Buscar descrição ou categoria…"
          aria-label="Buscar regra"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {list.length === 0 ? (
        <p className="muted set-rules-empty">
          {q
            ? "Nenhuma regra encontrada."
            : "Nenhuma regra ainda — corrigir uma categoria em Transações cria a primeira."}
        </p>
      ) : (
        <div className="set-rules-grid">
          {list.map((r) => (
            <div key={r.id} className="set-rule-row">
              <span className="mono set-rule-matcher" title={r.matcher}>
                {r.matcher}
              </span>
              <CategoryChip
                value={r.category_id}
                ariaLabel={`Categoria da regra ${r.matcher}`}
                onChange={(id) => id !== null && patchRule.mutate({ id: r.id, category_id: id })}
              />
              <button
                type="button"
                className="set-rule-x"
                aria-label={`Apagar a regra ${r.matcher}`}
                onClick={() =>
                  window.confirm(`Apagar a regra "${r.matcher}"?`) && deleteRule.mutate(r.id)
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="set-ignore">
        <div className="set-ignore-head">
          <h3>Regras de ignorar</h3>
          <span className="sub">
            criadas pelo ⊘ em Transações — a transação entra marcada como ignorada, fora do
            fluxo
          </span>
        </div>
        {ignoradas.length === 0 ? (
          <p className="muted">Nenhuma regra de ignorar.</p>
        ) : (
          <div className="set-rules-grid">
            {ignoradas.map((r) => (
              <div key={r.id} className="set-rule-row">
                <span className="mono set-rule-matcher" title={r.matcher}>
                  {r.matcher}
                </span>
                <span className="set-kind-tag">ignorada</span>
                <button
                  type="button"
                  className="set-rule-x"
                  aria-label={`Apagar a regra de ignorar ${r.matcher}`}
                  onClick={() =>
                    window.confirm(`Apagar a regra de ignorar "${r.matcher}"?`) &&
                    deleteIgnoreRule.mutate(r.id)
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="note set-rules-foot">
        Apagar pede confirmação. A regra deixa de valer para importações futuras —
        lançamentos já classificados por ela continuam como estão.
      </p>
    </section>
  );
}
```

- [ ] **Step 3.3: CSS**

Ao final da seção "Configurações" de `frontend/src/styles/pages.css`:

```css
/* Rail gruda como o do Orçamento; some o sticky em janela estreita via media query
   do grid (Step 4.3). */
.set-accounts {
  position: sticky;
  top: 20px;
}

.set-inst-list {
  margin-top: 13px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.set-inst-label {
  margin-bottom: 2px;
}

.set-account-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px solid var(--divider);
}

.set-kind-tag {
  font-size: 10.5px;
  color: var(--ink-2);
  padding: 1.5px 8px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border-strong);
  white-space: nowrap;
}

.set-new-account {
  margin-top: 14px;
  padding-top: 13px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.set-new-account input {
  width: 100%;
  box-sizing: border-box;
}

.set-new-account-row {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
}

.set-rule-search {
  min-width: 230px;
}

.set-rules-empty {
  margin-top: 12px;
}

.set-rules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 0 26px;
  margin-top: 8px;
}

.set-rule-row {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) auto 22px;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--divider);
}

.set-rule-matcher {
  font-size: 11.5px;
  color: var(--ink-2);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.set-rule-x {
  font: inherit;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.set-rule-x:hover {
  color: var(--over);
}

.set-ignore {
  margin-top: 16px;
  padding-top: 13px;
  border-top: 1px solid var(--border);
}

.set-ignore-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.set-rules-foot {
  margin-top: 14px;
  padding-top: 11px;
  border-top: 1px solid var(--border);
  font-size: 11px;
}
```

- [ ] **Step 3.4: Verificar e commitar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: tudo verde (143 testes; componentes ainda não usados).

```bash
cd /home/mathe/programming/financial-tracking-platform
git add frontend/src/components/settings frontend/src/styles/pages.css
git commit -m "feat(ui): settings accounts rail and rules card"
```

---

### Task 4: Reescrita da página, morte do `CategorySelect`, limpeza do legado e verificação

**Files:**
- Modify: `frontend/src/pages/Settings.tsx` (reescrita)
- Delete: `frontend/src/components/CategorySelect.tsx`
- Modify: `frontend/src/styles/pages.css` (grid + limpeza do legado)

- [ ] **Step 4.1: Reescrever a página**

Substituir todo o conteúdo de `frontend/src/pages/Settings.tsx` por:

```tsx
import PageHeader from "../components/PageHeader";
import AccountsRail from "../components/settings/AccountsRail";
import CategoriesCard from "../components/settings/CategoriesCard";
import LlmCard from "../components/settings/LlmCard";
import RulesCard from "../components/settings/RulesCard";

export default function Settings() {
  return (
    <div className="settings-page">
      <PageHeader eyebrow="Configurações" title="Como o app classifica" />
      <LlmCard />
      <section className="set-grid">
        <CategoriesCard />
        <AccountsRail />
      </section>
      <RulesCard />
    </div>
  );
}
```

- [ ] **Step 4.2: Apagar `CategorySelect`**

```bash
rm frontend/src/components/CategorySelect.tsx
```

(Só a página antiga de Settings o usava — confirmar com
`grep -rn "CategorySelect" frontend/src` antes de apagar; deve sobrar zero uso.)

- [ ] **Step 4.3: CSS do grid**

Ao final da seção "Configurações" de `frontend/src/styles/pages.css`:

```css
.settings-page {
  max-width: 1240px;
}

.set-grid {
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(240px, 300px);
  gap: var(--gap-section);
  align-items: start;
  margin-bottom: var(--gap-section);
}

.set-grid .card {
  margin-bottom: 0;
}

@media (max-width: 900px) {
  .set-grid {
    grid-template-columns: 1fr;
  }

  .set-accounts {
    position: static;
  }
}
```

- [ ] **Step 4.4: Limpeza do CSS legado**

Esta era a última tela; o bloco "LEGADO" no topo de `pages.css` agora deve encolher.
Para **cada** item abaixo, rodar o grep indicado e **só remover se não houver nenhum
uso** fora do próprio CSS:

1. Aliases de token `--good` / `--critical` / `--baseline`:
   `grep -rn -- "--good\|--critical\|--baseline" frontend/src --include=*.tsx --include=*.ts`
   → esperado zero usos (Trends antiga e o InlineText antigo eram os últimos); remover o
   bloco `:root { --good: … }` e o comentário.
2. `.row`: `grep -rn '"row"' frontend/src --include=*.tsx` → se zero, remover a regra.
3. `.pos`: `grep -rn '"pos"\|className="pos' frontend/src --include=*.tsx` → se zero, remover.
4. `.badge`: `grep -rn '"badge"' frontend/src --include=*.tsx` → se zero, remover.
5. Margem legada de `h2, h3`: as telas novas usam `.card-head` (h2 com `margin: 0` em
   `components.css`) — **verificar visualmente** que os títulos `h2`/`h3` dentro dos
   cards novos não colam no conteúdo antes de remover; se algum card novo depende da
   margem (ex.: `h2` + `.sub` soltos em AccountsRail/RulesCard), **manter a regra** e
   anotar no commit.
6. Estilos de `table`/`th`/`td`: `grep -rln "<table" frontend/src/pages frontend/src/components`
   → Transações ainda usa tabela; **manter**.

Atualizar o comentário do topo do arquivo para refletir o que sobrou.

- [ ] **Step 4.5: Verificar**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint && npm run build`
Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: frontend 143 testes PASS, build ok; backend `110 passed` (intocado).

> `npm run build` não é opcional: o app é acessado em `localhost:8000`, onde o FastAPI
> serve `frontend/dist`.

- [ ] **Step 4.6: Verificação visual (skill webapp-testing)**

Em `http://localhost:5173/#/config` (vite dev; **nunca** subir servidor de teste na
porta 8000 — é a porta do app real). Todas as escritas devem ser **revertidas** ao
final (é o banco real):

1. **Header:** eyebrow "Configurações", h1 "Como o app classifica".
2. **LLM:** pill "Chave da API configurada" (accent); card do modelo atual com borda
   accent e radio preenchido; clicar no outro card habilita "Salvar modelo" e o hint
   muda; **não salvar** — clicar de volta no modelo atual desabilita de novo. Digitar
   um id no card "Outro modelo" + Enter seleciona (card tracejado fica ativo, id em
   mono); voltar ao modelo original.
3. **Categorias:** contagem "N ativas"; grupos Entradas → Investimento → Saídas com
   pontinho de cor e ordem alfabética; renomear uma categoria via texto inline e
   **renomear de volta**; pill de tipo abre o select nativo (cancelar o confirm não
   muda nada); checkbox "mostrar arquivadas" revela arquivadas com opacidade e
   "restaurar"; arquivar uma categoria de teste e **restaurar** em seguida.
4. **Contas:** rail sticky; grupos por instituição em uppercase; sumário "N contas em
   M instituições"; pills de kind; formulário de nova conta com segmented
   corrente/cartão (não criar conta — só conferir o disabled sem nome/instituição).
5. **Regras:** contagem; busca filtra por matcher ("iof") e por categoria ("moradia");
   chip de categoria abre o select (não trocar); × pede confirmação (cancelar);
   bloco "Regras de ignorar" com tag "ignorada"; rodapé explicativo.
6. Screenshot em dark e em light; console sem erros.

- [ ] **Step 4.7: Commit**

```bash
cd /home/mathe/programming/financial-tracking-platform
git add -A frontend/src
git commit -m "feat(ui): redesigned settings page"
```

- [ ] **Step 4.8: Revisão de código**

Usar a skill code-review sobre o conjunto de commits deste plano (preferência do usuário:
sem revisor por task, uma revisão ao final). Aplicar o que for real, commitar como
`fix(ui): address review findings in the settings redesign`.
