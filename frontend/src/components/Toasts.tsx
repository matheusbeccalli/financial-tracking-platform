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
