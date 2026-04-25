// @ts-nocheck
// VoyageEndModal — opens from VoyageDetail's "⚑ End Voyage" button (edit mode).
// Finalizes a voyage: aggregates per-leg fuel totals, collects the single
// lub-oil entry (ME cons / 13S-14S / Used LO13C), engineer + notes + end-date.

import { useMemo, useState } from 'react';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { calcVoyageTotals, formatMT } from '../../domain/calculations';
import { voyageRouteLabel } from '../../domain/factories';
import { X } from '../Icons';

export function VoyageEndModal({ filename, shipClass, onClose }) {
  const { loadedById, endVoyage } = useVoyageStore();
  const voyage = loadedById[filename];

  const totals = useMemo(
    () => (voyage && shipClass ? calcVoyageTotals(voyage, shipClass) : { hfo: 0, mgo: 0, lsfo: 0 }),
    [voyage, shipClass],
  );
  const totalFuel = (Number(totals.hfo || 0) + Number(totals.mgo || 0) + Number(totals.lsfo || 0));

  const prevLube = voyage?.voyageEnd?.lubeOil || {};
  const [meCons,    setMeCons]    = useState(prevLube.meCons    || '');
  const [lo13s14s,  setLo13s14s]  = useState(prevLube.lo13s14s  || '');
  const [usedLo13c, setUsedLo13c] = useState(prevLube.usedLo13c || '');
  const [engineer,  setEngineer]  = useState(voyage?.voyageEnd?.engineer || '');
  const [endDate,   setEndDate]   = useState(
    voyage?.endDate || voyage?.voyageEnd?.completedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
  );
  const [notes,     setNotes]     = useState(voyage?.voyageEnd?.notes || '');
  const [error, setError] = useState(null);

  useEscapeKey(onClose);

  const canSubmit = !!shipClass && !!voyage && !!endDate;

  function handleSubmit(e) {
    e?.preventDefault?.();
    if (!canSubmit) return;
    try {
      endVoyage(filename, {
        shipClass,
        endDate,
        engineer: engineer.trim(),
        notes: notes.trim(),
        lubeOil: {
          meCons:    meCons,
          lo13s14s:  lo13s14s,
          usedLo13c: usedLo13c,
        },
      });
      onClose();
    } catch (err) {
      console.error('[VoyageEndModal] failed', err);
      setError(err?.message || 'Failed to end voyage.');
    }
  }

  const voyageLabel = voyage ? voyageRouteLabel(voyage) : filename;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-content w-full"
        style={{ maxWidth: 760 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-voyage-title"
      >
        <div className="modal-head flex items-center justify-between">
          <h2 id="end-voyage-title">⚑ End Voyage — <span className="font-normal opacity-75">{voyageLabel}</span></h2>
          <button
            type="button"
            className="p-1 rounded hover:bg-black/10"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form className="p-5 space-y-5" onSubmit={handleSubmit}>
          <p className="text-[0.78rem]" style={{ color: 'var(--color-dim)' }}>
            Finalize this voyage. Totals below are aggregated from every leg. Lub-oil consumption
            is recorded here once per voyage.
          </p>

          {/* Aggregated totals */}
          <div className="cat-card fuel">
            <div className="cat-label">⛴ Cruise Totals (MT)</div>
            <div className="cat-body">
              <div className="grid grid-cols-4 gap-4">
                <div className="fuel-col hfo">
                  <div className="fc-type"><span className="fc-dot" />HFO</div>
                  <div className="fc-big">{formatMT(totals.hfo)}</div>
                </div>
                <div className="fuel-col mgo">
                  <div className="fc-type"><span className="fc-dot" />MGO</div>
                  <div className="fc-big">{formatMT(totals.mgo)}</div>
                </div>
                <div className="fuel-col lsfo">
                  <div className="fc-type"><span className="fc-dot" />LSFO</div>
                  <div className="fc-big">{formatMT(totals.lsfo)}</div>
                </div>
                <div className="fuel-col">
                  <div className="fc-type" style={{ color: 'var(--color-dim)' }}>Σ Total</div>
                  <div className="fc-big" style={{ color: 'var(--color-text)' }}>{formatMT(totalFuel)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Lub-Oil (ONLY entered here) */}
          <div className="cat-card lube">
            <div className="cat-label">Lub-Oil · recorded at voyage end</div>
            <div className="cat-body grid grid-cols-3 gap-3">
              <div>
                <div className="form-label">ME consumption</div>
                <input
                  className="form-input font-mono"
                  placeholder="0"
                  inputMode="decimal"
                  value={meCons}
                  onChange={(e) => setMeCons(e.target.value)}
                />
              </div>
              <div>
                <div className="form-label">13S / 14S</div>
                <input
                  className="form-input font-mono"
                  placeholder="0"
                  inputMode="decimal"
                  value={lo13s14s}
                  onChange={(e) => setLo13s14s(e.target.value)}
                />
              </div>
              <div>
                <div className="form-label">Used LO13C</div>
                <input
                  className="form-input font-mono"
                  placeholder="0"
                  inputMode="decimal"
                  value={usedLo13c}
                  onChange={(e) => setUsedLo13c(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Signature + notes */}
          <div
            className="glass-card rounded-xl p-4 grid grid-cols-2 gap-4"
          >
            <div>
              <div className="form-label">Chief engineer</div>
              <input
                className="form-input"
                placeholder="Name · signature"
                value={engineer}
                onChange={(e) => setEngineer(e.target.value)}
              />
            </div>
            <div>
              <div className="form-label">Ended on</div>
              <input
                type="date"
                className="form-input font-mono"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <div className="form-label">Notes</div>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Any remarks for this voyage…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div
              className="p-3 rounded-lg text-xs"
              style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' }}
              role="alert"
            >
              <strong>Failed:</strong> {error}
            </div>
          )}

          <div
            className="flex gap-2 justify-end pt-3 border-t"
            style={{ borderColor: 'var(--color-border-subtle)' }}
          >
            <button type="button" className="btn-flat px-4 py-2 rounded-lg text-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-warning px-4 py-2 rounded-lg text-sm"
              disabled={!canSubmit}
            >
              ⚑ End voyage
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
