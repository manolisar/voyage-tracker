// Shared Escape-closes-modal hook. Attaches a single keydown listener on
// window that fires `handler` when the user presses Escape. When `disabled`
// is truthy (e.g. a modal is busy saving), the keypress is ignored.

import { useEffect } from 'react';

export function useEscapeKey(handler: () => void, disabled = false): void {
  useEffect(() => {
    if (disabled) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler, disabled]);
}
