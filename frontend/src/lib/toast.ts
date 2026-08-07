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
