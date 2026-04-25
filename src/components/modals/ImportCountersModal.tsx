// ImportCountersModal — opens after creating a new voyage when there's a
// previous ended voyage on this ship. Lets the chief carry forward the
// counters from the previous voyage's last arrival phase, with per-equipment
// deselection — a deselected row is tagged "RESET", signalling that the
// physical counter was zeroed/replaced between voyages.
//
// Two-step UI (mirrors v6's flow):
//   1. Intro view — "Start Fresh" or "Import Counters" buttons.
//   2. Selection view — tickbox list per equipment, with values from the
//      previous voyage's last arrival phase. Deselected rows show "RESET".
//
// Data-driven over shipClass.equipment (no hardcoded keys), so adding a new
// ship class doesn't require a code change here.

import { useMemo, useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { inheritedCounter } from '../../domain/factories';
import { Anchor, Check, X } from '../Icons';
import type { ShipClass, Voyage } from '../../types/domain';

interface Props {
  prevVoyage: Voyage;
  shipClass: ShipClass;
  onStartFresh: () => void;
  onImport: (counters: Record<string, string>) => void;
  onClose: () => void;
}

function formatNumber(num: string | null | undefined): string {
  if (!num || num === '') return '–';
  const n = parseFloat(num);
  if (!Number.isFinite(n)) return num;
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Pull the carry-forward value (end || start, see inheritedCounter) for each
// equipment from the previous voyage's last leg's last arrival phase.
function getLastCounterValues(
  prevVoyage: Voyage,
  shipClass: ShipClass,
): Record<string, string> {
  const lastLeg = prevVoyage.legs?.[prevVoyage.legs.length - 1];
  if (!lastLeg?.arrival?.phases?.length) return {};
  const phases = lastLeg.arrival.phases;
  const lastPhase = phases[phases.length - 1];
  if (!lastPhase?.equipment) return {};
  const out: Record<string, string> = {};
  for (const def of shipClass.equipment) {
    out[def.key] = inheritedCounter(lastPhase.equipment[def.key]);
  }
  return out;
}

export function ImportCountersModal({
  prevVoyage,
  shipClass,
  onStartFresh,
  onImport,
  onClose,
}: Props) {
  const lastCounters = useMemo(
    () => getLastCounterValues(prevVoyage, shipClass),
    [prevVoyage, shipClass],
  );

  // Default: every equipment with a value is selected. Equipment with no
  // value can't be selected (nothing to carry).
  const initialSelected = useMemo(() => {
    const s: Record<string, boolean> = {};
    for (const def of shipClass.equipment) {
      s[def.key] = !!lastCounters[def.key];
    }
    return s;
  }, [shipClass, lastCounters]);

  const [selected, setSelected] = useState<Record<string, boolean>>(initialSelected);
  const [showSelection, setShowSelection] = useState(false);

  useEscapeKey(onClose);

  const handleSelectAll = () => {
    const next: Record<string, boolean> = {};
    for (const def of shipClass.equipment) next[def.key] = !!lastCounters[def.key];
    setSelected(next);
  };
  const handleDeselectAll = () => {
    const next: Record<string, boolean> = {};
    for (const def of shipClass.equipment) next[def.key] = false;
    setSelected(next);
  };
  const handleToggle = (key: string) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleImport = () => {
    const counters: Record<string, string> = {};
    for (const def of shipClass.equipment) {
      const v = lastCounters[def.key];
      if (selected[def.key] && v) counters[def.key] = v;
    }
    onImport(counters);
  };

  const selectedCount = shipClass.equipment.filter(
    (def) => selected[def.key] && lastCounters[def.key],
  ).length;

  const prevLabel = `${prevVoyage.fromPort?.code || '—'} → ${prevVoyage.toPort?.code || '—'}`;

  if (!showSelection) {
    return (
      <div className="modal-overlay" onClick={onClose} role="presentation">
        <div
          className="modal-content w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-counters-title"
        >
          <div className="modal-head flex items-start justify-between">
            <div className="flex items-start gap-3">
              <Anchor className="w-5 h-5 mt-0.5" />
              <div>
                <h2 id="import-counters-title">New Voyage</h2>
                <p>Previous voyage data available</p>
              </div>
            </div>
            <button
              type="button"
              className="p-1 rounded hover:bg-black/10"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6">
            <p className="text-[0.82rem] mb-4" style={{ color: 'var(--color-text)' }}>
              Would you like to import counter values from the last voyage?
            </p>
            <div
              className="rounded-lg p-3 mb-5"
              style={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border-subtle)' }}
            >
              <div className="form-label mb-1">Last voyage</div>
              <div className="font-bold text-[0.88rem]" style={{ color: 'var(--color-text)' }}>
                {prevLabel}
              </div>
              <div className="text-[0.72rem] font-mono mt-0.5" style={{ color: 'var(--color-dim)' }}>
                {prevVoyage.endDate || prevVoyage.startDate || '—'}
                {' · '}
                {prevVoyage.legs?.length || 0} leg{prevVoyage.legs?.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                className="btn-flat flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold"
                onClick={onStartFresh}
              >
                Start Fresh
              </button>
              <button
                type="button"
                className="btn-primary flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold"
                onClick={() => setShowSelection(true)}
              >
                Import Counters
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-content w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-counters-select-title"
      >
        <div className="modal-head flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Anchor className="w-5 h-5 mt-0.5" />
            <div>
              <h2 id="import-counters-select-title">Import Counters</h2>
              <p>From: {prevLabel}</p>
            </div>
          </div>
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
            Select which counters to carry over. Deselect any that were reset (counter zeroed or replaced).
          </p>

          <div className="flex gap-3 mb-4">
            <button
              type="button"
              onClick={handleSelectAll}
              className="btn-flat px-3 py-1.5 rounded-lg text-[0.72rem]"
            >
              ✓ Select All
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="btn-flat px-3 py-1.5 rounded-lg text-[0.72rem]"
            >
              ✕ Deselect All
            </button>
          </div>

          <div className="space-y-2 mb-4">
            {shipClass.equipment.map((def) => {
              const value = lastCounters[def.key];
              const hasValue = !!value;
              const on = !!selected[def.key] && hasValue;
              return (
                <button
                  key={def.key}
                  type="button"
                  disabled={!hasValue}
                  onClick={() => hasValue && handleToggle(def.key)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left"
                  style={{
                    background: on ? 'var(--color-surface2)' : 'transparent',
                    borderColor: on ? 'var(--color-ocean-500)' : 'var(--color-border-subtle)',
                    opacity: hasValue ? 1 : 0.4,
                    cursor: hasValue ? 'pointer' : 'not-allowed',
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
                      {on && <Check className="w-3 h-3" />}
                    </span>
                    <span className="font-medium text-[0.82rem]" style={{ color: 'var(--color-text)' }}>
                      {def.label}
                    </span>
                  </div>
                  <div className="text-right">
                    {hasValue ? (
                      <>
                        <div className="font-mono font-bold text-[0.82rem]" style={{ color: 'var(--color-text)' }}>
                          {formatNumber(value)} m³
                        </div>
                        {!selected[def.key] && (
                          <div
                            className="text-[0.6rem] font-bold uppercase tracking-wider"
                            style={{ color: 'var(--color-error-fg)' }}
                          >
                            RESET
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-[0.72rem]" style={{ color: 'var(--color-faint)' }}>
                        No data
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div
            className="rounded-lg p-3 mb-4 text-[0.72rem]"
            style={{ background: 'var(--color-surface2)', color: 'var(--color-dim)' }}
          >
            Selected counters will populate the first departure phase START values.
          </div>

          <div className="flex gap-3 justify-end pt-3 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <button
              type="button"
              onClick={() => setShowSelection(false)}
              className="btn-flat px-4 py-2 rounded-lg text-sm"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold"
            >
              Import {selectedCount > 0 ? `${selectedCount} counter${selectedCount === 1 ? '' : 's'}` : 'selected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
