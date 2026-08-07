# Toast global de erros de mutação — Design

**Data:** 2026-08-07
**Status:** aprovado

## Problema

Mutations que falham são silenciosas: `useInvalidatingMutation` só tem
`onSuccess` e nenhuma tela renderiza `.error` de mutation (exceto o upload de
Imports). Caso real: `POST /budgets/copy` retornou 405 (servidor com código
antigo) e a UI não deu nenhum sinal.

## Decisões

- **Toast apenas para mutations** (ações do usuário). Erros de queries mantêm
  o tratamento local das telas — toast em query com polling geraria spam
  durante restart do servidor.
- **Wire-up central** via `MutationCache.onError` no `QueryClient`: cobre
  todas as mutations existentes e futuras sem tocar em nenhum hook.
- **Sem dependências novas**: store pub/sub próprio (~20 linhas) + componente
  + CSS com as variáveis existentes (dark mode automático).

## Componentes

### `frontend/src/lib/toast.ts` (novo)

Store puro, fora do React (o callback do QueryClient vive fora da árvore):

- `interface Toast { id: number; message: string }`
- `showToast(message: string): void` — acrescenta com id incremental.
- `dismissToast(id: number): void`
- `subscribeToasts(fn: (toasts: Toast[]) => void): () => void` — retorna
  unsubscribe; novo assinante recebe o estado atual imediatamente.

### `frontend/src/App.tsx`

```ts
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  mutationCache: new MutationCache({
    onError: (error) => showToast((error as Error).message),
  }),
});
```

`<Toasts />` renderizado uma vez, dentro do provider, fora das rotas.

### `frontend/src/components/Toasts.tsx` (novo)

- `useSyncExternalStore(subscribeToasts, getToasts)` (ou
  useState+useEffect com o subscribe — o que ficar mais simples).
- Pilha `position: fixed` no canto inferior direito, `role="alert"`,
  clique fecha, auto-dismiss em 6s (setTimeout por toast no componente).
- Classe `.toast` no `styles.css`: fundo `--surface`, borda `--critical`,
  texto `--ink`, sombra leve.

## Testes

- `frontend/src/lib/toast.test.ts`: assinante recebe estado atual ao
  assinar; showToast notifica; dismiss remove; unsubscribe para de
  notificar; ids únicos.
- Verificação Playwright: provocar erro real de mutation no app e ver o
  toast (ex.: PATCH inválido ou endpoint indisponível).

## Fora de escopo

Toasts de sucesso; toasts para erros de query; fila com limite/dedupe;
animações.
