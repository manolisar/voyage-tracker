// @ts-nocheck
// NewVoyageModal — opens from the top bar "+ New Voyage" button (edit mode).
// Collects: embarkation + disembarkation ports (via PortCombobox against the
// UN/LOCODE catalog) + start date (+ optional end date). The actual file
// write goes through VoyageStore.createVoyage, which stamps a filename of
// the form <SHIP_CODE>_<startDate>_<fromPort>-<toPort>.json.

import { useState } from 'react';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { PortCombobox } from '../ui/PortCombobox';
import { X } from '../Icons';

export function NewVoyageModal({ ship, shipClass, onClose }) {
  const { createVoyage } = useVoyageStore();
  const [fromPort, setFromPort] = useState(null);
  const [toPort,   setToPort]   = useState(null);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate]     = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEscapeKey(onClose, busy);

  const canSubmit = !!fromPort?.code && !!toPort?.code && !!startDate && !busy && !!shipClass && !!ship?.code;

  async function handleCreate(e) {
    e?.preventDefault?.();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await createVoyage({
        shipClass,
        shipCode: ship.code,
        fromPort,
        toPort,
        startDate,
        endDate,
      });
      onClose();
    } catch (err) {
      console.error('[NewVoyageModal] create failed', err);
      setError(err?.message || 'Failed to create voyage.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose} role="presentation">
      <div
        className="modal-content w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-voyage-title"
      >
        <div className="modal-head flex items-center justify-between">
          <h2 id="new-voyage-title">New Voyage</h2>
          {!busy && (
            <button
              type="button"
              className="p-1 rounded hover:bg-black/10"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <form className="p-5 grid grid-cols-2 gap-4" onSubmit={handleCreate}>
          <div>
            <PortCombobox
              id="embark-port"
              label="Embarkation port"
              value={fromPort}
              onChange={setFromPort}
              disabled={busy}
              autoFocus
            />
          </div>
          <div>
            <PortCombobox
              id="disembark-port"
              label="Disembarkation port"
              value={toPort}
              onChange={setToPort}
              disabled={busy}
            />
          </div>
          <div>
            <div className="form-label">Start date</div>
            <input
              type="date"
              className="form-input font-mono"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <div className="form-label">End date <span style={{ color: 'var(--color-faint)' }}>(optional)</span></div>
            <input
              type="date"
              className="form-input font-mono"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={busy}
            />
          </div>

          {error && (
            <div
              className="col-span-2 p-3 rounded-lg text-xs"
              style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' }}
              role="alert"
            >
              <strong>Failed:</strong> {error}
            </div>
          )}

          <div
            className="col-span-2 flex gap-2 justify-end pt-2 border-t mt-2"
            style={{ borderColor: 'var(--color-border-subtle)' }}
          >
            <button
              type="button"
              className="btn-flat px-4 py-2 rounded-lg text-sm"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-4 py-2 rounded-lg text-sm"
              disabled={!canSubmit}
            >
              {busy ? 'Creating…' : 'Create voyage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
