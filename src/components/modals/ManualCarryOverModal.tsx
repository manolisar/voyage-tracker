// @ts-nocheck
// ManualCarryOverModal — confirms which equipment END values get copied into
// the target phase's START. Ported from v6 but data-driven over the ship
// class's equipment list instead of hardcoded DG/boiler keys.

import { useState } from 'react';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { X } from '../Icons';

export function ManualCarryOverModal({ shipClass, onClose }) {
  const { lastEditedPhase, findNextPhaseFor, applyCarryOver } = useVoyageStore();
  const source = lastEditedPhase;
  const target = source ? findNextPhaseFor(source) : null;

  // Start with every equipment selected; user can untick individual rows.
  const initSelected = () => {
    const s = {};
    for (const def of shipClass?.equipment || []) s[def.key] = true;
    return s;
  };
  const [selected, setSelected] = useState(initSelected);

  // Modal is mounted fresh each time the user opens the FAB (parent toggles
  // `carryOverOpen`), so `useState(initSelected)` runs with the current source
  // on every open — no sync effect needed.

  useEscapeKey(onClose);

  if (!source || !target || !shipClass) return null;

  const hasValue = (def) => {
    const v = source.equipment?.[def.key];
    return v !== '' && v != null;
  };
  const validSelection = shipClass.equipment.some((def) => hasValue(def) && selected[def.key]);

  const handleConfirm = () => {
    const counters = {};
    for (const def of shipClass.equipment) {
      const v = source.equipment?.[def.key];
      if (selected[def.key] && v !== '' && v != null) counters[def.key] = v;
    }
    applyCarryOver(target, counters);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-content w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="carry-over-title"
      >
        <div className="modal-head flex items-center justify-between">
          <h2 id="carry-over-title">Carry Over Counters</h2>
          <button
            type="button"
            className="p-1 rounded hover:bg-black/10"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-[0.78rem] mb-4" style={{ color: 'var(--color-dim)' }}>
            Copy END values into the next phase's START.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <Card label="From (END)" value={source.phaseName} />
            <Card label="To (START)" value={target.phaseName} />
          </div>

          <div className="space-y-2 mb-4">
            {shipClass.equipment.map((def) => {
              const val = source.equipment?.[def.key];
              const can = hasValue(def);
              const on  = !!selected[def.key] && can;
              return (
                <button
                  key={def.key}
                  type="button"
                  disabled={!can}
                  onClick={() => can && setSelected((s) => ({ ...s, [def.key]: !s[def.key] }))}
                  className="w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left"
                  style={{
                    background: on ? 'var(--color-surface2)' : 'transparent',
                    borderColor: on ? 'var(--color-ocean-500)' : 'var(--color-border-subtle)',
                    opacity: can ? 1 : 0.4,
                    cursor: can ? 'pointer' : 'not-allowed',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
                      style={{
                        background: on ? 'var(--color-ocean-500)' : 'var(--color-surface2)',
                        color: on ? 'white' : 'var(--color-dim)',
                        border: on ? 'none' : '1px solid var(--color-border-subtle)',
                      }}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className="font-medium text-[0.82rem]" style={{ color: 'var(--color-text)' }}>
                      {def.label}
                    </span>
                  </div>
                  <span className="font-mono text-[0.78rem]" style={{ color: 'var(--color-dim)' }}>
                    {can ? `${parseFloat(val).toFixed(1)} m³` : '—'}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 justify-end pt-3 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <button type="button" className="btn-flat px-4 py-2 rounded-lg text-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary px-4 py-2 rounded-lg text-sm"
              disabled={!validSelection}
              onClick={handleConfirm}
            >
              Carry Over
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border-subtle)' }}
    >
      <div className="form-label mb-1">{label}</div>
      <div className="text-[0.78rem] font-medium truncate" style={{ color: 'var(--color-text)' }}>
        {value}
      </div>
    </div>
  );
}
