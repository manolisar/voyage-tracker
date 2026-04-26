// DeleteLegModal — confirmation before VoyageStore.deleteLeg removes a leg
// from the voyage. Destructive (the leg's reports go with it); there is no
// undo. The dropped leg is rewritten through the normal autosave path so the
// loggedBy stamp records who removed it.

import { useState } from 'react';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { sortLegsByDate } from '../../domain/factories';
import { X, AlertTriangle } from '../Icons';

interface Props {
  filename: string;
  legId: number;
  onClose: () => void;
}

export function DeleteLegModal({ filename, legId, onClose }: Props) {
  const { loadedById, deleteLeg } = useVoyageStore();
  const voyage = loadedById[filename];
  const sortedLegs = sortLegsByDate(voyage?.legs);
  const idx = sortedLegs.findIndex((l) => l.id === legId);
  const leg = idx >= 0 ? sortedLegs[idx] : null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(onClose, busy);

  const depPort = leg?.departure?.port?.split(',')[0]?.trim() || 'Dep';
  const arrPort = leg?.arrival?.port?.split(',')[0]?.trim() || 'Arr';
  const depDate = leg?.departure?.date || '';
  const arrDate = leg?.arrival?.date || '';
  const hasVR = !!leg?.voyageReport;

  function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      deleteLeg(filename, legId);
      onClose();
    } catch (err) {
      console.error('[DeleteLegModal] delete failed', err);
      setError((err as Error)?.message || 'Failed to delete leg.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose} role="presentation">
      <div
        className="modal-content w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-leg-title"
      >
        <div className="modal-head flex items-center justify-between">
          <h2 id="delete-leg-title" className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-warn-fg)' }} />
            Delete leg
          </h2>
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

        <div className="p-5 space-y-4">
          <p className="text-[0.82rem]" style={{ color: 'var(--color-text)' }}>
            This will permanently remove the departure report, arrival report
            {hasVR ? ', and voyage report ' : ' '}
            for this leg. There is no undo.
          </p>

          {leg ? (
            <div
              className="rounded-xl p-3"
              style={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border-subtle)' }}
            >
              <div className="text-[0.88rem] font-semibold" style={{ color: 'var(--color-text)' }}>
                Leg {idx + 1} · {depPort} → {arrPort}
              </div>
              {(depDate || arrDate) && (
                <div className="text-[0.72rem] font-mono mt-0.5" style={{ color: 'var(--color-dim)' }}>
                  {depDate || '—'} → {arrDate || '—'}
                </div>
              )}
            </div>
          ) : (
            <div
              className="p-3 rounded-lg text-xs"
              style={{ background: 'var(--color-warn-bg)', color: 'var(--color-warn-fg)' }}
              role="alert"
            >
              Leg not found in this voyage.
            </div>
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
            <button
              type="button"
              className="btn-flat px-4 py-2 rounded-lg text-sm"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-warning px-4 py-2 rounded-lg text-sm"
              onClick={handleConfirm}
              disabled={busy || !leg}
            >
              {busy ? 'Deleting…' : 'Delete leg'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
