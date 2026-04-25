// Context object only. Provider lives in ToastProvider.tsx.
import { createContext } from 'react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastContextValue {
  addToast: (message: string, type?: ToastType, duration?: number) => number;
  removeToast: (id: number) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
