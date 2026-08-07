# Mutation Error Toasts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda mutation que falha mostra um toast de erro no canto da tela; nenhuma mutation silenciosa.

**Architecture:** Store pub/sub puro (`src/lib/toast.ts`) + `MutationCache.onError` central no `QueryClient` + componente `Toasts` fixo com auto-dismiss. Sem dependências novas.

**Tech Stack:** React/TS/TanStack Query v5/Vitest (environment node).

**Spec:** `docs/superpowers/specs/2026-08-07-mutation-error-toasts-design.md`

---

## File Structure

- Create: `frontend/src/lib/toast.ts` + `frontend/src/lib/toast.test.ts`
- Create: `frontend/src/components/Toasts.tsx`
- Modify: `frontend/src/App.tsx` — MutationCache + `<Toasts />`
- Modify: `frontend/src/styles.css` — classes `.toasts`/`.toast`

Contexto para o executor:

- Branch de trabalho: `feature/mutation-error-toasts` (criar de `main` se não
  existir). Comandos de `frontend/`: `npm test -- --run` (hoje 23 testes) e
  `npm run build`.
- `App.tsx` atual cria `new QueryClient({ defaultOptions: ... })` na linha 11
  e renderiza providers/rotas — leia antes de editar.
- Variáveis CSS disponíveis (light/dark automático): `--surface`, `--ink`,
  `--critical`, `--border`.
- Vitest roda em `environment: node` — os testes cobrem só o store puro
  (nenhum teste de componente/DOM).

---

### Task 1: Store, wire-up e componente

- [ ] **Step 1: Write the failing tests**

Criar `frontend/src/lib/toast.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { dismissToast, resetToasts, showToast, subscribeToasts } from "./toast";

beforeEach(() => resetToasts());

describe("toast store", () => {
  it("assinante recebe o estado atual imediatamente", () => {
    showToast("erro A");
    const fn = vi.fn();
    subscribeToasts(fn);
    expect(fn).toHaveBeenCalledWith([expect.objectContaining({ message: "erro A" })]);
  });

  it("showToast notifica com ids únicos", () => {
    const fn = vi.fn();
    subscribeToasts(fn);
    showToast("um");
    showToast("dois");
    const toasts = fn.mock.calls.at(-1)![0];
    expect(toasts.map((t: { message: string }) => t.message)).toEqual(["um", "dois"]);
    expect(new Set(toasts.map((t: { id: number }) => t.id)).size).toBe(2);
  });

  it("dismissToast remove", () => {
    const fn = vi.fn();
    subscribeToasts(fn);
    showToast("x");
    const id = fn.mock.calls.at(-1)![0][0].id;
    dismissToast(id);
    expect(fn.mock.calls.at(-1)![0]).toEqual([]);
  });

  it("unsubscribe para de notificar", () => {
    const fn = vi.fn();
    const unsub = subscribeToasts(fn);
    unsub();
    showToast("y");
    expect(fn).toHaveBeenCalledTimes(1); // só a chamada inicial
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npm test -- --run`
Expected: FAIL (módulo `./toast` não existe)

- [ ] **Step 3: Implement the store**

Criar `frontend/src/lib/toast.ts`:

```ts
export interface Toast {
  id: number;
  message: string;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<(t: Toast[]) => void>();

function notify() {
  for (const fn of listeners) fn(toasts);
}

export function showToast(message: string): void {
  toasts = [...toasts, { id: nextId++, message }];
  notify();
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export function getToasts(): Toast[] {
  return toasts;
}

export function subscribeToasts(fn: (t: Toast[]) => void): () => void {
  listeners.add(fn);
  fn(toasts);
  return () => listeners.delete(fn);
}

/** Só para testes. */
export function resetToasts(): void {
  toasts = [];
  nextId = 1;
  listeners.clear();
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- --run`
Expected: verdes (23 + 4 novos = 27)

- [ ] **Step 5: Component + wire-up + CSS**

Criar `frontend/src/components/Toasts.tsx`:

```tsx
import { useEffect, useSyncExternalStore } from "react";

import { dismissToast, getToasts, subscribeToasts } from "../lib/toast";

function subscribe(onChange: () => void) {
  return subscribeToasts(onChange);
}

export default function Toasts() {
  const toasts = useSyncExternalStore(subscribe, getToasts);

  useEffect(() => {
    if (!toasts.length) return;
    const newest = toasts[toasts.length - 1];
    const timer = setTimeout(() => dismissToast(newest.id), 6000);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast" role="alert" onClick={() => dismissToast(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
```

Nota: `subscribeToasts` chama o assinante com o array; `useSyncExternalStore`
espera um callback sem argumentos — o wrapper `subscribe` resolve, e
`getToasts` retorna a referência estável do array (o store substitui o array
a cada mudança, então o snapshot é consistente).

Em `frontend/src/App.tsx`:

```ts
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Toasts from "./components/Toasts";
import { showToast } from "./lib/toast";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  mutationCache: new MutationCache({
    onError: (error) => showToast((error as Error).message || "Erro inesperado"),
  }),
});
```

e renderizar `<Toasts />` logo antes de `</QueryClientProvider>` (fora do
`<HashRouter>`).

Em `frontend/src/styles.css`, ao final:

```css
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
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--critical);
  border-left-width: 4px;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 13px;
  box-shadow: 0 2px 10px var(--border);
  cursor: pointer;
}
```

- [ ] **Step 6: Test + typecheck**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: 27 testes verdes, build limpo.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/toast.ts frontend/src/lib/toast.test.ts \
  frontend/src/components/Toasts.tsx frontend/src/App.tsx frontend/src/styles.css
git commit -m "feat(ui): global error toasts for failed mutations"
```

---

### Task 2: Verificação visual (controlador)

- [ ] Rebuild; Playwright em `http://localhost:8000`: provocar uma mutation
  com erro real — ex.: na tela Orçamento, interceptar `POST /api/budgets`
  com `page.route` retornando 500 `{"detail": "erro de teste"}` e editar um
  valor de orçamento (blur dispara o PUT) — o toast deve aparecer com a
  mensagem, e sumir ao clicar. Screenshot. (page.route evita tocar em dados
  reais e não exige derrubar o servidor.)
