// Lightweight toast queue. Carried from v6 with the same public API:
//   const { addToast } = useToast();
//   addToast('Saved', 'success');
//   addToast('Network down', 'error', 6000);

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  ToastContext,
  type ToastContextValue,
  type ToastType,
} from './ToastContext';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 4000): number => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
      return id;
    },
    [],
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ addToast, removeToast }),
    [addToast, removeToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            onClick={() => removeToast(t.id)}
          >
            {t.type === 'success' && <span aria-hidden="true">✓</span>}
            {t.type === 'error' && <span aria-hidden="true">✕</span>}
            {t.type === 'warning' && <span aria-hidden="true">⚠</span>}
            {t.type === 'info' && <span aria-hidden="true">ℹ</span>}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
