// useFocusTrap — modal accessibility primitive.
//
// Replaces the stand-alone useEscapeKey pattern for dialogs. Per WCAG 2.1 AA
// modals must:
//   1. Move focus into the dialog on open
//   2. Trap Tab / Shift-Tab between the first and last focusable in the dialog
//   3. Restore focus to whatever was focused before the dialog opened
//   4. Close on Escape — but only the topmost dialog when several are stacked
//      (e.g. Settings → ImportCounters from a chained "Reset to baseline" warning).
//
// A small module-level stack tracks open dialogs so:
//   - Escape only fires onEscape for the top of the stack
//   - useModalOpenCount() drives `inert` on the AppShell chrome behind the dialog
//
// Portal'd children (e.g. PortCombobox dropdown rendered to document.body) are
// not part of the tab cycle by design — those use arrow keys + Enter/onMouseDown
// to commit, never Tab.

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react';

interface Options {
  onEscape?: () => void;
  disabled?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

interface StackEntry {
  id: number;
}

let modalStack: StackEntry[] = [];
const stackListeners = new Set<() => void>();
let nextId = 1;

function notifyStack(): void {
  for (const fn of stackListeners) fn();
}

function pushStack(id: number): void {
  modalStack.push({ id });
  notifyStack();
}

function popStack(id: number): void {
  modalStack = modalStack.filter((m) => m.id !== id);
  notifyStack();
}

function isTop(id: number): boolean {
  return modalStack[modalStack.length - 1]?.id === id;
}

function subscribeStack(cb: () => void): () => void {
  stackListeners.add(cb);
  return () => {
    stackListeners.delete(cb);
  };
}

function getStackSize(): number {
  return modalStack.length;
}

export function useModalOpenCount(): number {
  return useSyncExternalStore(subscribeStack, getStackSize, getStackSize);
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  const all = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return all.filter((el) => {
    if (el.hidden) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    // offsetParent is null for `display: none` and detached nodes; allow the
    // currently focused element through so re-focusing during transitions
    // doesn't get rejected.
    if (el.offsetParent === null && el !== document.activeElement) return false;
    return true;
  });
}

export function useFocusTrap<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  options: Options = {},
): void {
  const { onEscape, disabled = false, initialFocusRef } = options;
  // Pull options into refs so the effect only re-runs on `disabled` changes —
  // otherwise a parent re-rendering with a fresh `onClose` lambda would
  // teardown/reopen the trap and steal focus on every render.
  const onEscapeRef = useRef(onEscape);
  const initialFocusInnerRef = useRef(initialFocusRef);
  const previousFocusRef = useRef<Element | null>(null);
  // Sync option refs in a layout effect so the keydown handler always sees
  // the latest values without re-binding the listener.
  useLayoutEffect(() => {
    onEscapeRef.current = onEscape;
    initialFocusInnerRef.current = initialFocusRef;
  });

  useEffect(() => {
    if (disabled) return undefined;
    const id = nextId++;
    pushStack(id);
    previousFocusRef.current = document.activeElement;

    const container = containerRef.current;
    if (container) {
      // Make container a focus fallback so Tab always has somewhere to land
      // (e.g. an empty confirmation dialog with a single button).
      if (!container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1');
      }
      const initial =
        initialFocusInnerRef.current?.current
        || getFocusable(container)[0]
        || container;
      // Defer to next frame so React has fully mounted children (refs settled,
      // autoFocus inputs have been visited) before we steal focus.
      requestAnimationFrame(() => {
        if (!isTop(id)) return; // a deeper modal opened in the same frame
        initial?.focus();
      });
    }

    const onKey = (e: KeyboardEvent) => {
      if (!isTop(id)) return;
      if (e.key === 'Escape') {
        const handler = onEscapeRef.current;
        if (handler) {
          e.stopPropagation();
          handler();
        }
        return;
      }
      if (e.key === 'Tab' && container) {
        const focusable = getFocusable(container);
        if (focusable.length === 0) {
          e.preventDefault();
          container.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        const inside = active instanceof Node && container.contains(active);
        if (e.shiftKey) {
          if (!inside || active === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (!inside || active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('keydown', onKey, true);
      popStack(id);
      const prev = previousFocusRef.current;
      if (prev instanceof HTMLElement) {
        // requestAnimationFrame lets React finish unmounting first; otherwise
        // Chrome can scroll-to the unmounting node before restoring.
        requestAnimationFrame(() => {
          if (document.contains(prev)) prev.focus();
        });
      }
    };
    // containerRef is stable; onEscape/initialFocusRef are read via ref so
    // they don't need to be in deps. `disabled` toggles the trap on/off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);
}
