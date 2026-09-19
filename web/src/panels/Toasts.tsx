// Avisos en vivo (docs/07): se apilan en una esquina y se van solos a los 6 segundos.
import { useEffect } from 'react';
import { useCity, type Toast } from '../store/city';

const VISIBLE_MS = 6_000;

export function Toasts() {
  const toasts = useCity((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <ToastLine key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastLine({ toast }: { toast: Toast }) {
  const dismiss = useCity((s) => s.dismissToast);
  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), VISIBLE_MS);
    return () => clearTimeout(id);
  }, [toast.id, dismiss]);

  return (
    <button type="button" className="toast" onClick={() => dismiss(toast.id)}>
      {toast.text}
    </button>
  );
}
