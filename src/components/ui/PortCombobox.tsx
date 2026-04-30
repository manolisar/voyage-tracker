// PortCombobox — typeahead over the shipped UN/LOCODE catalog + per-ship
// custom additions. Surfaces the resolved port object via onChange:
//   { code: "MIA", name: "Miami", country: "US", locode: "USMIA" }
//
// Flow:
//   - User types code or name → filtered dropdown.
//   - User picks a row → onChange fires with the port object.
//   - User types a 3-letter code that isn't in the catalog → inline prompt
//     for name + country; on confirm the port is persisted to IDB under
//     customPorts/<shipId> and bubbles up via onChange.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from '../../hooks/useSession';
import { loadPorts } from '../../domain/ports';
import { getCustomPorts, addCustomPort } from '../../storage/indexeddb';
import type { PortRef } from '../../types/domain';

const CODE_RE = /^[A-Z]{3}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const MAX_PORT_NAME_LEN = 64;

interface Props {
  id?: string;
  label?: string;
  value: PortRef | null;
  onChange?: (port: PortRef) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

interface PendingUnknown {
  code: string;
  name: string;
  country: string;
}

export function PortCombobox({
  id,
  label,
  value,
  onChange,
  disabled = false,
  placeholder = 'Type a port (e.g. MIA, Miami)',
  autoFocus = false,
}: Props) {
  const { shipId } = useSession();
  const reactId = useId();
  const listboxId = `${id ?? reactId}-listbox`;
  const optionId = (i: number) => `${id ?? reactId}-opt-${i}`;
  const [catalog, setCatalog] = useState<PortRef[]>([]);
  const [customs, setCustoms] = useState<PortRef[]>([]);
  const [query, setQuery] = useState(value?.code || '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pendingUnknown, setPendingUnknown] = useState<PendingUnknown | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  // Dropdown coordinates in viewport (fixed) coords. Recomputed on open and
  // on scroll/resize so the popup tracks the input. Rendered via portal so
  // the modal's `overflow: hidden` scrollbox can't clip it.
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number; width: number } | null>(null);

  // Keep the input synced if the parent replaces `value` externally (form
  // reset, clear, etc.). This is the "adjust state during render" pattern
  // from React docs — cheaper than an effect and avoids cascading renders.
  const externalCode = value?.code || '';
  const [prevExternalCode, setPrevExternalCode] = useState(externalCode);
  if (externalCode !== prevExternalCode) {
    setPrevExternalCode(externalCode);
    setQuery(externalCode);
  }

  useEffect(() => {
    let alive = true;
    loadPorts()
      .then((p) => {
        if (alive) setCatalog(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!shipId) return undefined;
    let alive = true;
    getCustomPorts(shipId)
      .then((p) => {
        if (alive) setCustoms(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [shipId]);

  // Track input position in viewport so the portal'd dropdown sits flush
  // beneath it. Recomputed on open + on any scroll/resize while open so the
  // popup tracks the input even when the modal scrollbox moves.
  useLayoutEffect(() => {
    if (!open || !inputRef.current) {
      setPopoverRect(null);
      return undefined;
    }
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPopoverRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, pendingUnknown]);

  const merged = useMemo<PortRef[]>(() => {
    // Customs first so the user sees their own ports at the top of suggestions.
    const seen = new Set(customs.map((c) => c.locode || c.code));
    const catalogFiltered = catalog.filter((c) => !seen.has(c.locode));
    return [...customs, ...catalogFiltered];
  }, [catalog, customs]);

  const matches = useMemo<PortRef[]>(() => {
    const q = query.trim().toUpperCase();
    if (!q) return merged.slice(0, 50);
    // 3-letter suffixes collide across countries (e.g. SIN matches Singapore,
    // South Sinai, Shiinoki, Sinpo, Siain). Surface all exact-code matches
    // first so the user sees every candidate before any substring hits.
    const exactCode: PortRef[] = [];
    const locodePrefix: PortRef[] = [];
    const nameMatch: PortRef[] = [];
    for (const p of merged) {
      if (p.code === q) exactCode.push(p);
      else if (p.locode?.startsWith(q)) locodePrefix.push(p);
      else if (p.name?.toUpperCase().includes(q)) nameMatch.push(p);
    }
    return [...exactCode, ...locodePrefix, ...nameMatch].slice(0, 50);
  }, [merged, query]);

  function commit(port: PortRef) {
    onChange?.(port);
    setQuery(port.code);
    setOpen(false);
    setPendingUnknown(null);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // Uppercase aggressively for codes; user typing a name sees their case
    // preserved because letters stay letters but we keep the normalized form
    // in `query` for matching.
    setQuery(raw.toUpperCase());
    setOpen(true);
    setHighlight(0);
    setPendingUnknown(null);
  }

  function handleBlur() {
    // Allow click on dropdown to register first.
    setTimeout(() => {
      if (pendingUnknown) return; // don't auto-close while editing the fallback form
      setOpen(false);
      const q = query.trim().toUpperCase();
      if (!CODE_RE.test(q)) return;
      if (q === value?.code) return;
      // 3-letter suffixes frequently collide across countries (e.g. SIN is
      // Singapore, South Sinai, Shiinoki, Sinpo, Siain). Only auto-commit
      // when the code is unambiguous — otherwise leave the input as-is so
      // the user picks a specific port from the dropdown.
      const candidates = merged.filter((p) => p.code === q);
      if (candidates.length === 1) {
        commit(candidates[0]);
      } else if (candidates.length === 0) {
        // Truly unknown code — enter the custom-port fallback.
        setPendingUnknown({ code: q, name: '', country: '' });
        setOpen(true);
      }
      // More than one candidate: do nothing — `value` stays whatever it was,
      // the form's submit button remains disabled until the user disambiguates.
    }, 120);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (pendingUnknown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && matches[highlight]) {
        e.preventDefault();
        commit(matches[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  async function confirmPendingUnknown() {
    if (!pendingUnknown) return;
    const { code, name, country } = pendingUnknown;
    // Trim + length-cap the name so "obscure port" doesn't become a vector for
    // unbounded data persisted in IDB. Country must be exactly two A–Z letters
    // so dropdowns don't pick up leftover whitespace or punctuation.
    const trimmedName = (name || '').trim().slice(0, MAX_PORT_NAME_LEN);
    const cc = (country || '').trim().toUpperCase();
    if (!CODE_RE.test(code) || !trimmedName || !COUNTRY_RE.test(cc)) return;
    const port: PortRef = { code, name: trimmedName, country: cc, locode: `${cc}${code}` };
    if (shipId) {
      try {
        await addCustomPort(shipId, port);
      } catch (err) {
        console.warn('[PortCombobox] addCustomPort failed', err);
      }
    }
    setCustoms((prev) => [port, ...prev.filter((p) => p.code !== code)]);
    commit(port);
  }

  const listboxOpen = open && !pendingUnknown && matches.length > 0 && !!popoverRect;

  return (
    <div className="relative">
      {label && (
        <label className="form-label" htmlFor={id ?? reactId} id={id ? `${id}-label` : undefined}>
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        id={id ?? reactId}
        type="text"
        className="form-input font-mono"
        value={query}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKey}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        autoFocus={autoFocus}
        maxLength={5}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listboxOpen}
        aria-controls={listboxId}
        aria-activedescendant={listboxOpen ? optionId(highlight) : undefined}
      />
      {listboxOpen && createPortal(
        <ul
          ref={listRef}
          id={listboxId}
          className="max-h-64 overflow-auto rounded-lg shadow-lg"
          role="listbox"
          style={{
            position: 'fixed',
            top: popoverRect.top,
            left: popoverRect.left,
            width: popoverRect.width,
            zIndex: 1100,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          {matches.map((p, i) => (
            <li
              key={p.locode || p.code}
              id={optionId(i)}
              role="option"
              aria-selected={i === highlight}
              className="px-3 py-2 text-sm cursor-pointer flex items-center justify-between"
              style={{
                background: i === highlight ? 'var(--color-surface2)' : 'transparent',
                color: 'var(--color-text)',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(p);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="truncate">
                <span className="font-mono font-semibold">{p.code}</span>
                <span style={{ color: 'var(--color-dim)' }}> — {p.name}</span>
                {p.country && (
                  <span style={{ color: 'var(--color-faint)' }}>, {p.country}</span>
                )}
              </span>
              {p.locode && (
                <span className="font-mono text-xs" style={{ color: 'var(--color-faint)' }}>
                  {p.locode}
                </span>
              )}
            </li>
          ))}
        </ul>,
        document.body,
      )}
      {pendingUnknown && (
        <div
          className="mt-2 p-3 rounded-lg text-xs"
          style={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border-subtle)' }}
        >
          <div style={{ color: 'var(--color-dim)' }} className="mb-2">
            <span className="font-mono font-semibold">{pendingUnknown.code}</span> isn't in the catalog. Add it?
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              className="form-input col-span-2"
              placeholder="Port name"
              value={pendingUnknown.name}
              onChange={(e) => setPendingUnknown((u) => (u ? { ...u, name: e.target.value } : u))}
            />
            <input
              type="text"
              className="form-input font-mono"
              placeholder="Country (2)"
              value={pendingUnknown.country}
              onChange={(e) =>
                setPendingUnknown((u) => (u ? { ...u, country: e.target.value.toUpperCase() } : u))
              }
              maxLength={2}
            />
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              className="btn-flat px-3 py-1 rounded text-xs"
              onClick={() => {
                setPendingUnknown(null);
                setQuery(value?.code || '');
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary px-3 py-1 rounded text-xs"
              onClick={confirmPendingUnknown}
            >
              Save port
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
