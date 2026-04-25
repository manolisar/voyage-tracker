// @ts-nocheck
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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../hooks/useSession';
import { loadPorts } from '../../domain/ports';
import { getCustomPorts, addCustomPort } from '../../storage/indexeddb';

const CODE_RE = /^[A-Z]{3}$/;

export function PortCombobox({
  id,
  label,
  value,               // current port object or null
  onChange,
  disabled = false,
  placeholder = 'Type a port (e.g. MIA, Miami)',
  autoFocus = false,
}) {
  const { shipId } = useSession();
  const [catalog, setCatalog] = useState([]);
  const [customs, setCustoms] = useState([]);
  const [query, setQuery] = useState(value?.code || '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pendingUnknown, setPendingUnknown] = useState(null); // { code, name, country }
  const inputRef = useRef(null);
  const listRef = useRef(null);

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
    loadPorts().then((p) => { if (alive) setCatalog(p); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!shipId) return undefined;
    let alive = true;
    getCustomPorts(shipId).then((p) => { if (alive) setCustoms(p); }).catch(() => {});
    return () => { alive = false; };
  }, [shipId]);

  const merged = useMemo(() => {
    // Customs first so the user sees their own ports at the top of suggestions.
    const seen = new Set(customs.map((c) => c.locode || c.code));
    const catalogFiltered = catalog.filter((c) => !seen.has(c.locode));
    return [...customs, ...catalogFiltered];
  }, [catalog, customs]);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return merged.slice(0, 50);
    // 3-letter suffixes collide across countries (e.g. SIN matches Singapore,
    // South Sinai, Shiinoki, Sinpo, Siain). Surface all exact-code matches
    // first so the user sees every candidate before any substring hits.
    const exactCode = [];
    const locodePrefix = [];
    const nameMatch = [];
    for (const p of merged) {
      if (p.code === q) exactCode.push(p);
      else if (p.locode?.startsWith(q)) locodePrefix.push(p);
      else if (p.name?.toUpperCase().includes(q)) nameMatch.push(p);
    }
    return [...exactCode, ...locodePrefix, ...nameMatch].slice(0, 50);
  }, [merged, query]);

  function commit(port) {
    onChange?.(port);
    setQuery(port.code);
    setOpen(false);
    setPendingUnknown(null);
  }

  function handleInput(e) {
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

  function handleKey(e) {
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
    const { code, name, country } = pendingUnknown;
    const trimmedName = (name || '').trim();
    const cc = (country || '').trim().toUpperCase();
    if (!CODE_RE.test(code) || !trimmedName || cc.length !== 2) return;
    const port = { code, name: trimmedName, country: cc, locode: `${cc}${code}` };
    try { await addCustomPort(shipId, port); }
    catch (err) { console.warn('[PortCombobox] addCustomPort failed', err); }
    setCustoms((prev) => [port, ...prev.filter((p) => p.code !== code)]);
    commit(port);
  }

  return (
    <div className="relative">
      {label && <div className="form-label" id={id ? `${id}-label` : undefined}>{label}</div>}
      <input
        ref={inputRef}
        id={id}
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
      />
      {open && !pendingUnknown && matches.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-lg shadow-lg"
          role="listbox"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)' }}
        >
          {matches.map((p, i) => (
            <li
              key={p.locode || p.code}
              role="option"
              aria-selected={i === highlight}
              className="px-3 py-2 text-sm cursor-pointer flex items-center justify-between"
              style={{
                background: i === highlight ? 'var(--color-surface2)' : 'transparent',
                color: 'var(--color-text)',
              }}
              onMouseDown={(e) => { e.preventDefault(); commit(p); }}
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
                <span className="font-mono text-xs" style={{ color: 'var(--color-faint)' }}>{p.locode}</span>
              )}
            </li>
          ))}
        </ul>
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
              onChange={(e) => setPendingUnknown((u) => ({ ...u, name: e.target.value }))}
            />
            <input
              type="text"
              className="form-input font-mono"
              placeholder="Country (2)"
              value={pendingUnknown.country}
              onChange={(e) => setPendingUnknown((u) => ({ ...u, country: e.target.value.toUpperCase() }))}
              maxLength={2}
            />
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              className="btn-flat px-3 py-1 rounded text-xs"
              onClick={() => { setPendingUnknown(null); setQuery(value?.code || ''); }}
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
