// @ts-nocheck
// FloatingCarryOverButton — bottom-right FAB that opens ManualCarryOverModal.
// Enabled only when `lastEditedPhase` is set (i.e. the user has changed an
// equipment END value since the last carry-over). Label echoes the source
// phase name so it's clear what's being carried.

import { useVoyageStore } from '../../hooks/useVoyageStore';

export function FloatingCarryOverButton({ onClick }) {
  const { lastEditedPhase, findNextPhaseFor } = useVoyageStore();
  const hasSource = !!lastEditedPhase;
  const target = hasSource ? findNextPhaseFor(lastEditedPhase) : null;
  const enabled = hasSource && !!target;

  const title = enabled
    ? `Carry Over — from: ${lastEditedPhase.phaseName || 'phase'} → ${target.phaseName || 'next phase'}`
    : hasSource
      ? 'No next phase to carry into'
      : 'Edit END values first to enable carry-over';

  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={enabled ? onClick : undefined}
      title={title}
      aria-label={title}
      className="fixed z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all font-semibold text-[0.78rem]"
      style={{
        right: '1.5rem',
        bottom: '1.5rem',
        background: enabled ? 'var(--color-ocean-500)' : 'var(--color-surface2)',
        color: enabled ? 'white' : 'var(--color-faint)',
        border: enabled ? 'none' : '1px solid var(--color-border-subtle)',
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.7,
      }}
    >
      <span aria-hidden>⇪</span>
      <span className="flex flex-col items-start leading-tight">
        <span>Carry Over</span>
        <span className="text-[0.62rem] font-normal" style={{ opacity: 0.85 }}>
          {enabled
            ? `from: ${lastEditedPhase.phaseName || 'phase'}`
            : hasSource
              ? 'no next phase'
              : 'edit END values first'}
        </span>
      </span>
    </button>
  );
}
