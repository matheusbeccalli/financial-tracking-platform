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
