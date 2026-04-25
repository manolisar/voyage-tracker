// AddLegModal — opens from VoyageDetail's "+ Add Leg" button (edit mode).
// Appends a leg to the selected voyage. Defaults the `from` port to the
// previous leg's `to` port and offers a carry-over of the last counters.

import { useMemo, useState, type FormEvent } from 'react';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { voyageRouteLabel } from '../../domain/factories';
import { X } from '../Icons';
import type { ShipClass } from '../../types/domain';

interface Props {
  filename: string;
  shipClass: ShipClass | null;
  // When set, the new leg's first departure phase starts are pre-populated
  // with these counters and the leg→leg "Carry over" checkbox is hidden
  // (the source has already been chosen at the voyage level).
  initialCounters?: Record<string, string> | null;
  onClose: () => void;
}

export function AddLegModal({ filename, shipClass, initialCounters = null, onClose }: Props) {
  const { loadedById, addLeg } = useVoyageStore();
  const voyage = loadedById[filename];
  const lastLeg = voyage?.legs?.[voyage.legs.length - 1] || null;
  const suggestedFrom = useMemo(() => lastLeg?.arrival?.port || '', [lastLeg]);
  const hasInitialCounters = !!initialCounters && Object.keys(initialCounters).length > 0;

  const [fromPort, setFromPort] = useState(suggestedFrom);
  const [toPort, setToPort] = useState('');
  const [depDate, setDepDate] = useState(lastLeg?.arrival?.date || voyage?.startDate || '');
  const [arrDate, setArrDate] = useState('');
  const [carryOver, setCarryOver] = useState(!!lastLeg && !hasInitialCounters);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(onClose);

  const canSubmit = !!shipClass && !!voyage;

  function handleSubmit(e: FormEvent) {
    e?.preventDefault?.();
    if (!canSubmit || !shipClass) return;
    try {
      addLeg(filename, {
        shipClass,
        fromPort: fromPort.trim(),
        toPort: toPort.trim(),
        depDate,
        arrDate,
        carryOverFrom: carryOver && !hasInitialCounters ? lastLeg : null,
        initialCounters: hasInitialCounters ? initialCounters : null,
      });
      onClose();
    } catch (err) {
      console.error('[AddLegModal] failed', err);
      setError((err as Error)?.message || 'Failed to add leg.');
    }
  }

  const voyageLabel = voyage ? voyageRouteLabel(voyage) : filename;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-content w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-leg-title"
      >
        <div className="modal-head flex items-center justify-between">
          <h2 id="add-leg-title">+ Add Leg — <span className="font-normal opacity-75">{voyageLabel}</span></h2>
          <button
            type="button"
            className="p-1 rounded hover:bg-black/10"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form className="p-5 space-y-4" onSubmit={handleSubmit}>
          <p className="text-[0.78rem]" style={{ color: 'var(--color-dim)' }}>
            Append a new leg to this voyage. Counter values can optionally carry over
            from the previous leg's arrival.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="form-label">From port</div>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Hong Kong"
                value={fromPort}
                onChange={(e) => setFromPort(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <div className="form-label">To port</div>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Shanghai"
                value={toPort}
                onChange={(e) => setToPort(e.target.value)}
              />
            </div>
            <div>
              <div className="form-label">Departure date</div>
              <input
                type="date"
                className="form-input font-mono"
                value={depDate}
                onChange={(e) => setDepDate(e.target.value)}
              />
            </div>
            <div>
              <div className="form-label">Arrival date</div>
              <input
                type="date"
                className="form-input font-mono"
                value={arrDate}
                onChange={(e) => setArrDate(e.target.value)}
              />
            </div>
          </div>

          {hasInitialCounters && (
            <div
              className="rounded-xl p-3 text-[0.78rem]"
              style={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-dim)' }}
            >
              <div className="font-semibold" style={{ color: 'var(--color-text)' }}>
                Importing counters from previous voyage
              </div>
              <div className="text-[0.72rem] font-mono mt-0.5">
                {Object.keys(initialCounters || {}).length} counter{Object.keys(initialCounters || {}).length === 1 ? '' : 's'} will populate the first departure phase START values.
              </div>
            </div>
          )}

          {lastLeg && !hasInitialCounters && (
            <label
              className="rounded-xl p-3 flex gap-3 items-start cursor-pointer"
              style={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border-subtle)' }}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={carryOver}
                onChange={(e) => setCarryOver(e.target.checked)}
              />
              <div>
                <div className="text-[0.82rem] font-semibold" style={{ color: 'var(--color-text)' }}>
                  Carry over arrival counters from previous leg
                </div>
                <div className="text-[0.72rem] font-mono mt-0.5" style={{ color: 'var(--color-dim)' }}>
                  {lastLeg.departure?.port?.split(',')[0] || 'Dep'} → {lastLeg.arrival?.port?.split(',')[0] || 'Arr'}
                  {' · '}{shipClass?.equipment?.length ?? '?'} equipment counters
                </div>
              </div>
            </label>
          )}

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
            <button type="submit" className="btn-primary px-4 py-2 rounded-lg text-sm" disabled={!canSubmit}>
              Add leg
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
