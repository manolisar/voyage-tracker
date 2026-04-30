// DeleteVoyageModal — confirmation before VoyageStore.deleteVoyage removes
// the on-disk JSON file. Destructive; there is no undo.

import { useRef, useState } from 'react';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { voyageRouteLongLabel } from '../../domain/factories';
import { X, AlertTriangle } from '../Icons';

interface Props {
  filename: string;
  onClose: () => void;
}

export function DeleteVoyageModal({ filename, onClose }: Props) {
  const { loadedById, voyages, deleteVoyage } = useVoyageStore();
  const voyage = loadedById[filename];
  const entry = voyages.find((v) => v.filename === filename) || null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, { onEscape: onClose, disabled: busy });

  const routeLabel = voyage
    ? voyageRouteLongLabel(voyage)
    : entry && entry.fromPort?.code && entry.toPort?.code
      ? `${entry.fromPort.code} → ${entry.toPort.code}`
      : filename;
  const startDate = voyage?.startDate || entry?.startDate || '';

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteVoyage(filename);
      onClose();
    } catch (err) {
      console.error('[DeleteVoyageModal] delete failed', err);
      setError((err as Error)?.message || 'Failed to delete voyage.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose} role="presentation">
      <div
        ref={dialogRef}
        className="modal-content w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-voyage-title"
      >
        <div className="modal-head flex items-center justify-between">
          <h2 id="delete-voyage-title" className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-warn-fg)' }} />
            Delete voyage
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
            This will permanently delete the voyage file from the ship's folder.
            Reports, legs, and any End-Voyage data are removed. There is no undo.
          </p>

          <div
            className="rounded-xl p-3"
            style={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border-subtle)' }}
          >
            <div className="text-[0.88rem] font-semibold" style={{ color: 'var(--color-text)' }}>
              {routeLabel}
            </div>
            {startDate && (
              <div className="text-[0.72rem] font-mono mt-0.5" style={{ color: 'var(--color-dim)' }}>
                Start date: {startDate}
              </div>
            )}
            <div className="text-[0.7rem] font-mono mt-0.5" style={{ color: 'var(--color-faint)' }}>
              {filename}
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
              className="btn-danger px-4 py-2 rounded-lg text-sm"
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? 'Deleting…' : 'Delete voyage'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
