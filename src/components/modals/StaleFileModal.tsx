// StaleFileModal — shown when the on-disk mtime is newer than what we
// loaded, meaning another crew member saved this voyage while we were
// editing it. See the plan's "Stale-file check" section.
//
// Three options:
//   • Reload from disk  — discard local edits, refetch the file.
//   • Overwrite anyway  — proceed with the save; the other edit is lost.
//   • Cancel            — keep editing; save stays scheduled for retry.
//
// The actual reload / overwrite / cancel logic lives in
// VoyageStoreProvider — this component is purely the dialog.

import { useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { X, Cloud } from '../Icons';

interface Props {
  filename: string;
  voyageLabel?: string | null;
  onReload: () => void;
  onForce: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function StaleFileModal({
  filename,
  voyageLabel,
  onReload,
  onForce,
  onCancel,
  busy = false,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Initial focus on the heading so the warning announces immediately to
  // screen readers and the user isn't still typing into a form input that
  // got obscured by this dialog (audit finding M19).
  useFocusTrap(dialogRef, { onEscape: onCancel, disabled: busy, initialFocusRef: headingRef });

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onCancel} role="presentation">
      <div
        ref={dialogRef}
        className="modal-content w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stale-file-title"
      >
        <div
          className="modal-head flex items-start justify-between"
          style={{ background: 'var(--color-warn-bg)', color: 'var(--color-warn-fg)' }}
        >
          <div className="flex items-start gap-3">
            <Cloud className="w-6 h-6 mt-0.5 shrink-0" />
            <div>
              <h2 id="stale-file-title" ref={headingRef} tabIndex={-1} style={{ color: 'inherit', outline: 'none' }}>File changed on disk</h2>
              <p style={{ color: 'inherit', opacity: 0.85 }}>
                Another crew member saved <strong>{voyageLabel || filename}</strong> in the shared folder while you were editing.
              </p>
            </div>
          </div>
          {!busy && (
            <button
              type="button"
              onClick={onCancel}
              className="p-1 rounded hover:bg-black/10"
              aria-label="Close"
              style={{ color: 'inherit' }}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-dim)' }}>
            Pick how to resolve this:
          </p>
          <ul className="text-sm space-y-2 list-disc pl-5" style={{ color: 'var(--color-text)' }}>
            <li><strong>Reload from disk</strong> — discard your local edits and load the latest version from the folder.</li>
            <li><strong>Overwrite anyway</strong> — save your local version, replacing the on-disk file (the other edit is lost).</li>
            <li><strong>Cancel</strong> — keep your local edits, do nothing for now. You can copy values out, then resolve manually.</li>
          </ul>

          <div className="mt-6 flex flex-wrap gap-3 justify-end">
            <button
              type="button"
              className="btn-flat px-4 py-2 rounded-lg text-sm"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary px-4 py-2 rounded-lg text-sm"
              onClick={onReload}
              disabled={busy}
            >
              {busy ? 'Working…' : 'Reload from disk'}
            </button>
            <button
              type="button"
              className="btn-warning px-4 py-2 rounded-lg text-sm"
              onClick={onForce}
              disabled={busy}
            >
              {busy ? 'Working…' : 'Overwrite anyway'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
