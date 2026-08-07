import { useEffect, useSyncExternalStore } from "react";

import { dismissToast, getToasts, subscribeToasts } from "../lib/toast";

function subscribe(onChange: () => void) {
  return subscribeToasts(onChange);
}

function ToastItem({ id, message }: { id: number; message: string }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(id), 6000);
    return () => clearTimeout(timer);
  }, [id]);
  return (
    <button type="button" className="toast" role="alert" onClick={() => dismissToast(id)}>
      {message}
    </button>
  );
}

export default function Toasts() {
  const toasts = useSyncExternalStore(subscribe, getToasts);
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} message={t.message} />
      ))}
    </div>
  );
}
